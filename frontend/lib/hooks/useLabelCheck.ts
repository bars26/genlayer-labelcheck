"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import LabelCheck, { type CreateCampaignInput, type TxProgress, type TxResult } from "../contracts/LabelCheck";
import { claimLabel, formatGen, isFunder, sameAddress, todayUtc, wei, windowLeftSeconds, RULING_STYLE, type Campaign, type Challenge, type Ruling } from "../contracts/types";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { TxError, classifyError } from "../utils/errors";
import { error, success } from "../utils/toast";
import { startTx, updateTx, type TxKind } from "./useTxLog";

export function useLabelCheckContract(): LabelCheck | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();
  return useMemo(
    () => (contractAddress ? new LabelCheck(contractAddress, address, studioUrl) : null),
    [contractAddress, address, studioUrl]
  );
}

type Registry = { campaigns: Campaign[]; challenges: Challenge[]; fetchedAt?: string };

async function fetchJson(url: string, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Every campaign and challenge, from the CDN-cached server snapshot (app/api/registry), so page
 * loads spend none of the visitor's Studio rate-limit budget. Falls back to two direct reads.
 */
export function useRegistry() {
  const contract = useLabelCheckContract();
  const query = useQuery<Registry, Error>({
    queryKey: ["registry"],
    queryFn: async () => {
      try {
        const body = await fetchJson("/api/registry");
        if (!Array.isArray(body.campaigns) || !Array.isArray(body.challenges)) throw new Error("Malformed snapshot");
        return body as Registry;
      } catch (snapshotErr) {
        if (!contract) throw classifyError(snapshotErr, "read");
        const [campaigns, challenges] = await Promise.all([contract.getCampaigns(), contract.getChallenges()]);
        return { campaigns, challenges, fetchedAt: new Date().toISOString() };
      }
    },
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  return {
    campaigns: query.data?.campaigns ?? [],
    challenges: query.data?.challenges ?? [],
    fetchedAt: query.data?.fetchedAt,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Re-read what a write touched and merge it into the cached registry. */
async function mergeFresh(qc: ReturnType<typeof useQueryClient>, contract: LabelCheck, campaignId?: string, challengeId?: string) {
  try {
    const [campaign, challenge] = await Promise.all([
      campaignId ? contract.getCampaignWithFunders(campaignId) : Promise.resolve(null),
      challengeId ? contract.getChallenge(challengeId) : Promise.resolve(null),
    ]);
    qc.setQueryData<Registry>(["registry"], (prev) => {
      let campaigns = prev?.campaigns ?? [];
      let challenges = prev?.challenges ?? [];
      if (campaign) campaigns = campaigns.some((c) => c.id === campaign.id) ? campaigns.map((c) => (c.id === campaign.id ? campaign : c)) : [...campaigns, campaign];
      if (challenge)
        challenges = challenges.some((s) => s.id === challenge.id) ? challenges.map((s) => (s.id === challenge.id ? challenge : s)) : [...challenges, challenge];
      return { campaigns, challenges, fetchedAt: prev?.fetchedAt };
    });
  } catch {
    // Already confirmed on chain; the next snapshot refresh picks it up.
  }
}

export type WriteVars =
  | { kind: "create"; input: CreateCampaignInput; fund: bigint }
  | { kind: "fund"; campaignId: string; value: bigint }
  | { kind: "challenge"; campaignId: string; barcode: string; claim: string }
  | { kind: "contest"; challengeId: string }
  | { kind: "settle"; challengeId: string }
  | { kind: "close"; campaignId: string }
  | { kind: "refund"; campaignId: string; funder: string };

export const WRITE_LABEL: Record<TxKind, string> = {
  create: "Open a campaign",
  fund: "Add to the pot",
  challenge: "Challenge a claim",
  contest: "Ask for a fresh reading",
  settle: "Settle",
  close: "Close the campaign",
  refund: "Return a funder's share",
};

const rulingNote = (v: unknown, s?: Challenge) => {
  const style = RULING_STYLE[String(v) as Ruling];
  if (!style) return "Recorded.";
  return `${style.label}. ${s?.why ?? style.help}`;
};

/** One mutation for every LabelCheck write, with a transaction log entry and typed errors. */
export function useLabelCheckWrite() {
  const contract = useLabelCheckContract();
  const { address } = useWallet();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (vars: WriteVars) => {
      const target =
        vars.kind === "create"
          ? vars.input.title
          : vars.kind === "challenge"
            ? `${vars.campaignId} ← ${vars.barcode} · ${claimLabel(vars.claim)}`
            : "challengeId" in vars
              ? vars.challengeId
              : vars.campaignId;
      const logId = startTx(vars.kind, target);
      setPending(
        vars.kind === "create"
          ? "create"
          : vars.kind === "refund"
            ? `refund:${vars.campaignId}:${vars.funder.toLowerCase()}`
            : vars.kind === "challenge"
              ? `challenge:${vars.campaignId}`
              : `${vars.kind}:${"challengeId" in vars ? vars.challengeId : vars.campaignId}`
      );
      const onProgress = (p: TxProgress) =>
        updateTx(logId, {
          state: p.step === "awaiting_wallet" ? "awaiting_wallet" : p.step === "accepted" ? "accepted" : "confirming",
          txHash: p.txHash,
          progress: p.message,
        });
      const refuse = (message: string): never => {
        throw new TxError({ kind: "contract_revert", phase: "estimate", message, hint: "The data was refreshed; nothing was sent." });
      };
      try {
        if (!contract) throw new TxError({ kind: "unknown", phase: "send", message: "The contract address is not configured." });
        if (!address) throw new TxError({ kind: "wallet_missing", phase: "send", message: "No wallet is connected." });

        let result: TxResult;
        let campaignId = "campaignId" in vars ? vars.campaignId : undefined;
        let challengeId = "challengeId" in vars ? vars.challengeId : undefined;
        let note = "Done.";
        // Re-read right before sending, so a stale list never sends a call the contract would refuse.
        switch (vars.kind) {
          case "create":
            result = await contract.createCampaign(vars.input, vars.fund, onProgress);
            campaignId = typeof result.returned === "string" ? result.returned : undefined;
            note = campaignId ? `${campaignId} takes challenges until ${vars.input.ends}.` : "Campaign opened.";
            break;
          case "fund": {
            const c = await contract.getCampaign(vars.campaignId);
            if (c.state !== "open" || todayUtc() > c.ends) refuse("This campaign no longer takes funding.");
            result = await contract.fund(vars.campaignId, vars.value, onProgress);
            note = "Added to the pot. Whatever is left when the campaign closes returns to funders in proportion.";
            break;
          }
          case "challenge": {
            const c = await contract.getCampaignWithFunders(vars.campaignId);
            if (c.state !== "open" || todayUtc() > c.ends) refuse(`This campaign took challenges until ${c.ends}.`);
            if (wei(c.pot) < wei(c.reward)) refuse("This campaign's pot is empty.");
            if (isFunder(c, address)) refuse("A funder cannot be paid by their own campaign.");
            const prior = await contract.challengeFor(vars.campaignId, vars.barcode, vars.claim);
            if (prior) {
              const s = await contract.getChallenge(prior);
              if (s.state === "pending") refuse(`${s.id} on this product and claim is still open.`);
              if (s.ruling === "UPHELD") refuse(`This claim on this product was already upheld (${s.id}).`);
            }
            result = await contract.challenge(vars.campaignId, vars.barcode, vars.claim, wei(c.stake), onProgress);
            challengeId = typeof result.returned === "string" ? result.returned : undefined;
            if (challengeId) {
              const s = await contract.getChallenge(challengeId);
              note = `${challengeId}: ${rulingNote(s.ruling, s)}`;
            }
            break;
          }
          case "contest": {
            const s = await contract.getChallenge(vars.challengeId);
            const c = await contract.getCampaignWithFunders(s.campaign_id);
            campaignId = c.id;
            if (s.state !== "pending") refuse("This challenge is already settled.");
            if (windowLeftSeconds(s) === 0) refuse("The response window has closed; the challenge can only be settled now.");
            const mine =
              s.ruling === "UPHELD" ? isFunder(c, address) && !s.funders_contested : sameAddress(s.challenger, address) && !s.challenger_contested;
            if (!mine) refuse("This ruling does not go against you, or your side has already asked for a fresh reading.");
            result = await contract.contest(vars.challengeId, onProgress);
            const fresh = await contract.getChallenge(vars.challengeId);
            note = `Read again: ${rulingNote(result.returned, fresh)} The response window restarted.`;
            break;
          }
          case "settle": {
            const s = await contract.getChallenge(vars.challengeId);
            const c = await contract.getCampaignWithFunders(s.campaign_id);
            campaignId = c.id;
            if (s.state !== "pending") refuse("This challenge is already settled.");
            if (windowLeftSeconds(s) > 0) {
              if (s.ruling === "UPHELD" && !isFunder(c, address)) refuse("Until the window ends, only a funder can pay early.");
              if (s.ruling !== "UPHELD" && !sameAddress(s.challenger, address)) refuse("Until the window ends, only the challenger can accept this ruling.");
            }
            result = await contract.settle(vars.challengeId, onProgress);
            note =
              result.returned === "paid"
                ? "The challenger got the stake back plus the reward."
                : result.returned === "stake_to_pot"
                  ? "The stake joined the campaign's pot."
                  : "The stake went back to the challenger.";
            break;
          }
          case "close": {
            const c = await contract.getCampaign(vars.campaignId);
            if (c.state !== "open") refuse("This campaign is already closed.");
            if (todayUtc() <= c.ends) refuse(`Challenges can be filed until ${c.ends}.`);
            if (wei(c.n_pending) > 0n) refuse("Settle the open challenges first.");
            result = await contract.close(vars.campaignId, onProgress);
            note = "Closed. Each funder's share can now be returned, one funder per transaction, by anyone.";
            break;
          }
          case "refund": {
            const c = await contract.getCampaignWithFunders(vars.campaignId);
            if (c.state !== "closed") refuse("Close the campaign first.");
            const row = c.funders?.find((f) => sameAddress(f.address, vars.funder));
            if (!row) refuse("That wallet did not fund this campaign.");
            if (row?.refunded) refuse("That funder's share has already been returned.");
            result = await contract.refund(vars.campaignId, vars.funder, onProgress);
            note = `${formatGen(String(result.returned ?? "0"), 4)} GEN returned to ${vars.funder.slice(0, 6)}…${vars.funder.slice(-4)}.`;
            break;
          }
        }
        updateTx(logId, { state: "accepted", txHash: result.txHash, status: result.status, executionResult: result.executionResult, progress: note });
        return { campaignId, challengeId, txHash: result.txHash, kind: vars.kind, note };
      } catch (err) {
        const e = classifyError(err, "send");
        if (contract) mergeFresh(qc, contract, "campaignId" in vars ? vars.campaignId : undefined, "challengeId" in vars ? vars.challengeId : undefined);
        updateTx(logId, {
          state: "failed",
          txHash: e.txHash,
          error: { kind: e.kind, message: e.message, hint: e.hint, detail: e.detail, phase: e.phase },
        });
        error(`${WRITE_LABEL[vars.kind]} failed`, { description: [e.message, e.hint].filter(Boolean).join(" "), duration: 12000 });
        throw err;
      } finally {
        setPending(null);
      }
    },
    onSuccess: ({ campaignId, challengeId, txHash, kind, note }) => {
      if (contract) mergeFresh(qc, contract, campaignId, challengeId);
      qc.invalidateQueries({ queryKey: ["genBalance"] });
      success(`${WRITE_LABEL[kind]} confirmed`, {
        description: `${note} Tx ${txHash.slice(0, 10)}... is ACCEPTED by validator consensus.`,
        duration: 10000,
      });
    },
  });

  return { write: mutation.mutate, writeAsync: mutation.mutateAsync, pending, isPending: mutation.isPending };
}
