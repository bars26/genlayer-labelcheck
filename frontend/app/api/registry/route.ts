import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { DEFAULT_CONTRACT_ADDRESS } from "@/lib/config";

/**
 * Server-side snapshot of every campaign and challenge, cached at the CDN.
 *
 * GenLayer Studio rate-limits per IP and counts contract reads (`gen_call`) in the same
 * 30-per-minute bucket as `eth_sendRawTransaction`. Reading the registry from the visitor's
 * browser would spend the budget the visitor needs for their own transactions, so it is read
 * here, with one `get_campaigns` and one `get_challenges` call per 200 items (plus each campaign's funders),
 * and served from the CDN.
 */

export const dynamic = "force-dynamic";

const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || DEFAULT_CONTRACT_ADDRESS) as `0x${string}`;
const RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

type Snapshot = { campaigns: unknown[]; challenges: unknown[]; fetchedAt: string };
let memo: { at: number; data: Snapshot } | null = null;
const MEMO_MS = 10_000;
const PAGE = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function read<T>(client: any, functionName: string, args: unknown[]): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await client.readContract({ address: CONTRACT, functionName, args })) as T;
    } catch (err) {
      last = err;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw last;
}

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Map ? Object.fromEntries(v) : v)));
}

async function readAll(client: any, functionName: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await read<unknown[]>(client, functionName, [offset, PAGE]);
    out.push(...page.map(toJson));
    if (page.length < PAGE) return out;
  }
}

async function fundersOf(client: any, campaign: any): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let offset = 0; offset < Number(campaign.n_funders ?? 0); offset += PAGE) {
    out.push(...JSON.parse(await read<string>(client, "get_funders", [campaign.id, offset, PAGE])));
  }
  return out;
}

async function load(): Promise<Snapshot> {
  const client: any = createClient({ chain: studionet, endpoint: RPC } as any);
  const campaigns = (await readAll(client, "get_campaigns")) as any[];
  for (const c of campaigns) c.funders = await fundersOf(client, c); // funders live outside the campaign record
  const challenges = await readAll(client, "get_challenges");
  return { campaigns, challenges, fetchedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    if (!memo || Date.now() - memo.at > MEMO_MS) {
      const data = await load();
      if (!memo || data.campaigns.length + data.challenges.length >= memo.data.campaigns.length + memo.data.challenges.length) memo = { at: Date.now(), data };
    }
    return Response.json(memo.data, {
      // Short on purpose: a long stale-while-revalidate would show the first visitor after a
      // quiet period a registry from hours ago, with sightings that were settled meanwhile.
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45" },
    });
  } catch (err) {
    if (memo) return Response.json(memo.data, { headers: { "Cache-Control": "public, s-maxage=10" } });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
