import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Campaign, Challenge, FunderRow } from "./types";
import { TxError, classifyError, rawMessage } from "../utils/errors";
import { withBackoff } from "../utils/retry";
import { takeSlot } from "../utils/rateBudget";

export type TxStep = "awaiting_wallet" | "submitted" | "retrying" | "accepted";

export interface TxProgress {
  step: TxStep;
  txHash?: string;
  message?: string;
}

export interface TxResult {
  txHash: string;
  status: string;
  executionResult: string;
  receipt: any;
  /** The contract method's return value (campaign id, challenge id, ruling, outcome, ...). */
  returned?: unknown;
}

/**
 * Pull the contract-execution outcome out of a consensus receipt.
 *   result.status "rollback" -> the contract raised; payload is its message.
 *   result.status "return"   -> payload.readable is the JSON-encoded return value.
 */
export function executionOutcome(receipt: any): { result: string; message: string; returned: unknown } {
  const lr = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(lr) ? lr[0] : lr;
  const result = String(first?.execution_result ?? receipt?.execution_result ?? "UNKNOWN");
  const r = first?.result ?? {};
  let returned: unknown = undefined;
  if (r?.status === "return") {
    const readable = r?.payload?.readable;
    try {
      returned = typeof readable === "string" ? JSON.parse(readable) : readable;
    } catch {
      returned = readable;
    }
  }
  const g = first?.genvm_result ?? {};
  const message = [
    r?.status === "rollback" && typeof r?.payload === "string" ? r.payload : "",
    g.error_description,
    typeof g.stderr === "string" ? (g.stderr.match(/UserError[^\n]*/)?.[0] ?? "") : "",
    Array.isArray(g.raw_error?.causes) ? g.raw_error.causes.join(",") : "",
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(" | ");
  return { result, message, returned };
}

const WRITE_EFFECT: Record<string, string> = {
  create_campaign: "no campaign was created",
  fund: "the pot was not changed",
  challenge: "no challenge was recorded (validators may have failed to read Open Food Facts or to agree)",
  contest: "the contest was not recorded",
  settle: "nothing was paid",
  close: "the campaign was not closed",
  refund: "nothing was returned",
};

export interface CreateCampaignInput {
  title: string;
  claims: string[];
  countries: string[];
  ends: string;
  reward: bigint;
  stake: bigint;
  perChallenger: number;
}

/** Typed wrapper around the LabelCheck Intelligent Contract. */
class LabelCheck {
  private contractAddress: `0x${string}`;
  private client: any;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    const config: any = { chain: studionet };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;
    this.client = createClient(config);
  }

  private read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    // Every attempt is a gen_call, so each one draws on the client-side rate budget.
    return withBackoff(
      async () => {
        await takeSlot();
        return (await this.client.readContract({ address: this.contractAddress, functionName, args })) as T;
      },
      { phase: "read", attempts: 5 }
    );
  }

  getCampaign = (id: string) => this.read<Campaign>("get_campaign", [id]);
  getChallenge = (id: string) => this.read<Challenge>("get_challenge", [id]);
  challengeFor = (campaignId: string, barcode: string, claim: string) => this.read<string>("challenge_for", [campaignId, barcode, claim]);
  /** A campaign with its funders attached (they are stored outside the campaign record, read in pages of 200). */
  getCampaignWithFunders = async (id: string): Promise<Campaign> => {
    const c = await this.getCampaign(id);
    const funders: FunderRow[] = [];
    for (let offset = 0; offset < Number(c.n_funders ?? 0); offset += 200) {
      funders.push(...(JSON.parse(await this.read<string>("get_funders", [id, offset, 200])) as FunderRow[]));
    }
    return { ...c, funders };
  };
  getCampaigns = (offset = 0, limit = 200) => this.read<Campaign[]>("get_campaigns", [offset, limit]).then((v) => (Array.isArray(v) ? v : []));
  getChallenges = (offset = 0, limit = 200) => this.read<Challenge[]>("get_challenges", [offset, limit]).then((v) => (Array.isArray(v) ? v : []));

  async getTransactionStatus(txHash: string): Promise<string> {
    const tx: any = await withBackoff(() => this.client.getTransaction({ hash: txHash as `0x${string}` }), { phase: "read" });
    return String(tx?.statusName ?? tx?.status_name ?? tx?.status ?? "UNKNOWN");
  }

  createCampaign(c: CreateCampaignInput, fundWei: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write(
      "create_campaign",
      [c.title, c.claims.join(","), c.countries.join(","), c.ends, c.reward, c.stake, c.perChallenger],
      fundWei,
      onProgress
    );
  }
  fund(campaignId: string, valueWei: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("fund", [campaignId], valueWei, onProgress);
  }
  challenge(campaignId: string, barcode: string, claim: string, stakeWei: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("challenge", [campaignId, barcode, claim], stakeWei, onProgress);
  }
  contest(challengeId: string, onProgress?: (p: TxProgress) => void) {
    return this.write("contest", [challengeId], 0n, onProgress);
  }
  settle(challengeId: string, onProgress?: (p: TxProgress) => void) {
    return this.write("settle", [challengeId], 0n, onProgress);
  }
  close(campaignId: string, onProgress?: (p: TxProgress) => void) {
    return this.write("close", [campaignId], 0n, onProgress);
  }
  refund(campaignId: string, funder: string, onProgress?: (p: TxProgress) => void) {
    return this.write("refund", [campaignId, funder], 0n, onProgress);
  }

  /**
   * Send a write and wait for consensus. Sends are never auto-retried (each attempt would
   * prompt the wallet again); receipt polling is, because the hash is already known.
   * A call the contract reverted is still ACCEPTED by consensus, so the receipt's
   * execution_result is checked and a revert is reported as such.
   */
  private async write(functionName: string, args: unknown[], value: bigint, onProgress?: (p: TxProgress) => void): Promise<TxResult> {
    await takeSlot((ms) =>
      onProgress?.({ step: "retrying", message: `Waiting ${Math.ceil(ms / 1000)}s to stay under GenLayer Studio's 30 requests per minute.` })
    );
    onProgress?.({ step: "awaiting_wallet", message: "Approve the transaction in your wallet." });
    let txHash: string;
    try {
      txHash = (await this.client.writeContract({ address: this.contractAddress, functionName, args, value })) as string;
    } catch (err) {
      throw classifyError(err, "send");
    }
    const reading =
      functionName === "challenge" || functionName === "contest"
        ? "Validators are reading the Open Food Facts record and looking at the front of the pack and the label (1 to 3 minutes)."
        : "Waiting for consensus.";
    onProgress?.({ step: "submitted", txHash, message: `Transaction sent. ${reading}` });

    let receipt: any;
    try {
      receipt = await withBackoff(
        () => this.client.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED" as any, retries: 72, interval: 5000 }),
        {
          phase: "confirm",
          onRetry: (i) => onProgress?.({ step: "retrying", txHash, message: `RPC busy while confirming; retrying in ${Math.round(i.waitMs / 1000)}s` }),
        }
      );
    } catch (err) {
      throw classifyError(err, "confirm", txHash);
    }

    const status = String(receipt?.statusName ?? receipt?.status_name ?? "ACCEPTED");
    const outcome = executionOutcome(receipt);
    onProgress?.({ step: "accepted", txHash, message: `Consensus status: ${status}` });
    // Payable methods refuse by refunding and returning "REFUNDED: <reason>" instead of reverting,
    // because GenLayer keeps a reverted call's value in the contract.
    if (typeof outcome.returned === "string" && outcome.returned.startsWith("REFUNDED:")) {
      throw new TxError({
        kind: "contract_revert",
        phase: "verify",
        txHash,
        message: `The contract refused this call and is sending your GEN back: ${outcome.returned.slice(9).trim()}`,
        hint: "Nothing changed. The refund lands in your wallet once the transaction finalizes.",
        detail: String(outcome.returned),
      });
    }
    if (outcome.result === "ERROR") {
      throw new TxError({
        kind: "accepted_no_effect",
        phase: "verify",
        txHash,
        message: `The transaction was ACCEPTED, but the contract rejected the call, so ${WRITE_EFFECT[functionName] ?? "nothing changed"}.`,
        hint: outcome.message ? `Contract message: ${outcome.message}` : "Open the transaction in the explorer for details.",
        detail: outcome.message || rawMessage(receipt?.result) || "execution_result: ERROR",
      });
    }
    return { txHash, status, executionResult: outcome.result, receipt, returned: outcome.returned };
  }
}

export default LabelCheck;
