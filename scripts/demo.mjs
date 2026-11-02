// Live end-to-end demo of LabelCheck on GenLayer Studio, using real Open Food Facts records and real package photos.
//
//   node scripts/demo.mjs <contract-address>
//
// The campaigns are DEMO campaigns funded by test wallets; the challenger is a test wallet. The products, their
// records and their photos are real, read live from Open Food Facts by every validator.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { writeFileSync } from "fs";

const [CONTRACT] = process.argv.slice(2);
if (!CONTRACT) {
  console.error("usage: node scripts/demo.mjs <contract-address>");
  process.exit(1);
}
const RPC = "https://studio.genlayer.com/api";
const GEN = 10n ** 18n;
const WINDOW_MS = 600_000;

function client(account) {
  return createClient({ chain: studionet, endpoint: RPC, account });
}

async function rpc(method, params) {
  // Studio sometimes answers with an HTML error page; these calls are reads or idempotent top-ups, so retry them.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    } catch (err) {
      if (attempt >= 5 || /^\w+: /.test(String(err?.message))) throw err;
      await new Promise((r) => setTimeout(r, 10000 * attempt));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const TRANSIENT = /rate limit|Unexpected token '<'|not valid JSON|fetch failed|ECONNRESET|socket hang up|50[234]/i;

async function write(c, who, functionName, args, value = 0n, { expectError = false } = {}) {
  const from = c.account.address;
  for (let attempt = 1; ; attempt++) {
    const nonceBefore = BigInt(await rpc("eth_getTransactionCount", [from, "latest"]));
    try {
      let hash;
      try {
        hash = await c.writeContract({ address: CONTRACT, functionName, args, value });
      } catch (err) {
        // The RPC sometimes answers a send with an HTML error page. Only resend if the
        // nonce did not move; otherwise the first send went through and we pick it up.
        if (!TRANSIENT.test(String(err?.message || err))) throw err;
        await sleep(15000);
        const nonceAfter = BigInt(await rpc("eth_getTransactionCount", [from, "latest"]));
        if (nonceAfter === nonceBefore) throw err;
        const txs = await rpc("sim_getTransactionsForAddress", [from]);
        hash = txs.filter((t) => (t.from_address || "").toLowerCase() === from.toLowerCase()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0].hash;
        console.log(`  send answered with an error page but the tx exists: ${hash}`);
      }
      // Once a hash exists, only the wait is retried; the transaction is never sent twice.
      let receipt;
      for (let wait = 1; ; wait++) {
        try {
          receipt = await c.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 60, interval: 5000 });
          break;
        } catch (err) {
          if (!TRANSIENT.test(String(err?.message || err)) || wait >= 6) throw Object.assign(err, { sent: true });
          await sleep(10000 * wait);
        }
      }
      const lr = receipt?.consensus_data?.leader_receipt;
      const first = Array.isArray(lr) ? lr[0] : lr;
      const exec = first?.execution_result ?? "?";
      let returned = first?.result?.payload?.readable;
      try { returned = JSON.parse(returned); } catch {}
      const row = {
        who,
        call: `${functionName}(${args.map((a) => (typeof a === "bigint" ? `${Number(a) / 1e18} GEN` : JSON.stringify(a)).slice(0, 60)).join(", ")})`,
        value: (Number(value) / 1e18).toString(),
        hash,
        status: receipt.statusName ?? receipt.status_name ?? "ACCEPTED",
        exec,
        returned: typeof returned === "string" ? returned : undefined,
      };
      log.push(row);
      console.log(`${row.who.padEnd(11)} ${row.call.padEnd(58)} ${row.status.padEnd(9)} ${row.exec.padEnd(7)} ${hash}${row.returned ? "  -> " + row.returned.slice(0, 160) : ""}`);
      if (expectError) {
        if (exec !== "ERROR") throw new Error(`${functionName} was expected to be refused but executed with ${exec}`);
        const msg = typeof first?.result?.payload === "string" ? first.result.payload : "";
        row.refused = msg;
        console.log(`  -> refused as designed: ${msg}`);
        return row;
      }
      if (exec !== "SUCCESS") throw new Error(`${functionName} executed with ${exec}`);
      return row;
    } catch (err) {
      const msg = String(err?.message || err);
      if (TRANSIENT.test(msg) && attempt < 5 && !err?.sent) {
        console.log(`  transient RPC error (${msg.slice(0, 60)}), waiting ${15 * attempt}s`);
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

async function read(c, functionName, args = []) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await c.readContract({ address: CONTRACT, functionName, args });
    } catch (err) {
      if (TRANSIENT.test(String(err?.message)) && attempt < 6) {
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

const balance = async (addr) => BigInt(await rpc("eth_getBalance", [addr, "latest"]));
const fmt = (wei) => (Number(wei) / 1e18).toFixed(2);
const fund = async (addr, gen) => rpc("sim_fundAccount", [addr, Number(gen * GEN)]);
const field = (obj, name) => (obj instanceof Map ? obj.get(name) : obj[name]);

const keys = { sponsor: generatePrivateKey(), cofunder: generatePrivateKey(), shopper: generatePrivateKey(), bystander: generatePrivateKey() };
const acct = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, createAccount(v)]));
const A = client(acct.sponsor);
const B = client(acct.cofunder);
const S = client(acct.shopper);
const X = client(acct.bystander);
if (process.env.DEMO_KEYS) writeFileSync(process.env.DEMO_KEYS, JSON.stringify(keys));

console.log("contract  ", CONTRACT);
for (const [k, a] of Object.entries(acct)) console.log(k.padEnd(10), a.address);
await fund(acct.sponsor.address, 20n);
await fund(acct.cofunder.address, 5n);
await fund(acct.shopper.address, 3n);
await fund(acct.bystander.address, 1n);
await sleep(3000);

const firstCampaign = (await read(A, "get_campaigns", [0, 200])).length;
let nextChallenge = (await read(A, "get_challenges", [0, 200])).length;
const cid = (n) => `campaign_${firstCampaign + n}`;
const challenges = [];
const rulingOf = async (id, label) => {
  const s = await read(A, "get_challenge", [id]);
  console.log(`  -> ${label}: ${field(s, "ruling")} (${field(s, "code")}) ${field(s, "why")}`);
  return field(s, "ruling");
};
const STAKE = GEN / 10n;
const challenge = async (who, c, campaignId, barcode, claim, label) => {
  const row = await write(c, who, "challenge", [campaignId, barcode, claim], STAKE);
  if (String(row.returned || "").startsWith("REFUNDED")) throw new Error(`challenge refused: ${row.returned}`);
  const id = `challenge_${nextChallenge++}`;
  challenges.push(id);
  await rulingOf(id, `${label} (${barcode}, ${claim})`);
  return id;
};

// Transfers out of the contract run as their own transactions once the call that emitted them is
// finalized, so balances are compared only when nothing touching the contract is in flight.
const quiet = async () => {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const txs = await rpc("sim_getTransactionsForAddress", [CONTRACT]);
    const busy = txs.filter((t) => t.status !== "FINALIZED" && t.status !== "CANCELED" && t.status !== "UNDETERMINED").length;
    if (busy === 0 && txs.length === last) return txs.length;
    last = busy === 0 ? txs.length : -1;
    await sleep(10000);
  }
  throw new Error("transactions did not finalize");
};
const reconciliations = [];
const reconcile = async (label) => {
  await quiet();
  const t = JSON.parse(await read(A, "totals"));
  const onChain = await balance(CONTRACT);
  const ok = BigInt(t.expected_balance) === onChain;
  reconciliations.push({ label, expected: t.expected_balance, balance: onChain.toString(), ok });
  console.log(`  reconcile (${label}): open pots + reserved rewards + open stakes = ${fmt(t.expected_balance)} GEN; contract balance ${fmt(onChain)} GEN ${ok ? "OK" : "MISMATCH"}`);
  if (!ok) throw new Error("balance mismatch");
};

const CLAIMS = "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_salt,source_of_fibre,high_fibre,source_of_protein,high_protein";
const ENDS = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
const open = (c, who, title, claims, countries, ends, reward, stake, perChallenger, value) =>
  write(c, who, "create_campaign", [title, claims, countries, ends, reward, stake, perChallenger], value);

// Refused at creation: the GEN comes straight back.
await open(A, "sponsor", "EU front-of-pack claims", "sugar_free,tasty", "", ENDS, GEN / 2n, STAKE, 5, 2n * GEN); // unknown claim code
await open(A, "sponsor", "EU front-of-pack claims", CLAIMS, "", "2026-02-31", GEN / 2n, STAKE, 5, 2n * GEN); // no such calendar date
await open(A, "sponsor", "EU front-of-pack claims", CLAIMS, "Spain", ENDS, GEN / 2n, STAKE, 5, 2n * GEN); // not an Open Food Facts country tag
await open(A, "sponsor", "EU front-of-pack claims", CLAIMS, "", ENDS, GEN / 20n, STAKE, 5, 2n * GEN); // reward below 0.1 GEN
await open(A, "sponsor", "EU front-of-pack claims", CLAIMS, "", ENDS, GEN, STAKE, 5, GEN / 2n); // pot smaller than one reward
await reconcile("after the refused campaigns: the contract kept nothing");

// Campaign 0: every claim, anywhere. Reward 0.5 GEN, stake 0.1 GEN.
console.log("");
await open(A, "sponsor", "EU front-of-pack claims", CLAIMS, "", ENDS, GEN / 2n, STAKE, 5, 3n * GEN);
await write(B, "cofunder", "fund", [cid(0)], GEN);
await write(X, "bystander", "fund", [cid(0)], GEN / 20n); // below the 0.1 GEN minimum top-up: sent back
const santiveri = await challenge("shopper", S, cid(0), "8412170028579", "sugar_free", "Santiveri cocoa biscuits, '0% azúcares'");
const gullon = await challenge("shopper", S, cid(0), "8410376009392", "sugar_free", "Gullón Zero fibre biscuits, 'sugar free'");
const fleury = await challenge("shopper", S, cid(0), "3095757697105", "low_salt", "Fleury Michon chicken, '-25% de sel'");
const pompotes = await challenge("shopper", S, cid(0), "3021769505602", "no_added_sugar", "Pom'Potes apple pouch, 'sans sucres ajoutés'");
const alpro = await challenge("shopper", S, cid(0), "5411188113416", "low_fat", "Alpro soy peach & passion fruit, 'bajo en grasas'");
await write(S, "shopper", "challenge", [cid(0), "8412170028579", "sugar_free"], STAKE); // already open: refunded
await write(S, "shopper", "challenge", [cid(0), "8412170028579", "high_protein"], GEN / 5n); // wrong stake: refunded
await write(A, "sponsor", "challenge", [cid(0), "3017624010701", "sugar_free"], STAKE); // a funder cannot be paid by their own campaign
await write(S, "shopper", "settle", [santiveri], 0n, { expectError: true }); // only a funder pays early
await write(B, "cofunder", "contest", [santiveri]); // a co-funder asks for a fresh reading
await rulingOf(santiveri, "Santiveri after the co-funder's contest");
await write(S, "shopper", "contest", [gullon]); // the shopper asks again on the conflicting record
await rulingOf(gullon, "Gullón after the shopper's contest");
await write(S, "shopper", "settle", [fleury]); // the shopper accepts the rejection at once: the stake joins the pot
await reconcile("campaign 0 open, Santiveri's reward reserved");

// Campaign 1: sugar claims on products sold in the United Kingdom only.
console.log("");
await open(A, "sponsor", "UK sugar claims", "sugar_free,low_sugar,no_added_sugar", "en:united-kingdom", ENDS, GEN / 4n, STAKE, 2, GEN);
const uk = await challenge("shopper", S, cid(1), "8412170028579", "sugar_free", "Santiveri in a UK-only campaign");
await write(X, "bystander", "close", [cid(1)], 0n, { expectError: true }); // challenges can be filed until the end date
await reconcile("both campaigns open");

console.log("\nwaiting 10 minutes for the response windows...");
await sleep(630_000);
for (const id of [santiveri, gullon, pompotes, alpro, uk]) await write(X, "bystander", "settle", [id]);
await write(S, "shopper", "challenge", [cid(0), "8412170028579", "sugar_free"], STAKE); // already upheld: refunded
await reconcile("end of run");

const campaigns = [cid(0), cid(1)];
console.log("\nfinal campaigns:");
const pots = {};
for (const id of campaigns) {
  pots[id] = JSON.parse(await read(A, "pot", [id]));
  console.log(`  ${id} ${JSON.stringify(pots[id])}`);
}
const evidence = {};
for (const id of challenges) {
  console.log(`  explain_challenge(${id}) = ${await read(A, "explain_challenge", [id])}`);
  const s = await read(A, "get_challenge", [id]);
  evidence[id] = {
    barcode: field(s, "barcode"), claim: field(s, "claim"), campaign: field(s, "campaign_id"), ruling: field(s, "ruling"),
    code: field(s, "code"), outcome: field(s, "outcome"), state: field(s, "state"), why: field(s, "why"),
    facts: JSON.parse(field(s, "facts_json")), timeline: JSON.parse(field(s, "timeline_json")), packets: JSON.parse(field(s, "evidence_json")),
  };
}
const balances = {};
for (const [k, a] of Object.entries(acct)) balances[k] = (await balance(a.address)).toString();
const out = { contract: CONTRACT, accounts: Object.fromEntries(Object.entries(acct).map(([k, a]) => [k, a.address])), campaigns, pots, challenges: evidence, reconciliations, balances, log };
writeFileSync(new URL("../docs/demo-run.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("\nwrote docs/demo-run.json");
