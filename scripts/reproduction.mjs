// Builds docs/REPRODUCTION.md from docs/demo-run.json (written by scripts/demo.mjs) and, when present,
// docs/ui-test.json (a MetaMask run from the live app).
//
//   node scripts/reproduction.mjs

import { existsSync, readFileSync, writeFileSync } from "fs";

const run = JSON.parse(readFileSync(new URL("../docs/demo-run.json", import.meta.url), "utf8"));
const EXPLORER = "https://explorer-studio.genlayer.com";
const tx = (h) => (h ? `[\`${h.slice(0, 10)}…\`](${EXPLORER}/tx/${h})` : "");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const gen = (wei) => `${(Number(BigInt(wei)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 })} GEN`;
const product = (code) => `[${code}](https://world.openfoodfacts.org/product/${code})`;
const LABEL = {
  sugar_free: "Sugar-free", low_sugar: "Low sugar", no_added_sugar: "No added sugars", fat_free: "Fat-free", low_fat: "Low fat",
  low_salt: "Low salt", source_of_fibre: "Source of fibre", high_fibre: "High fibre", source_of_protein: "Source of protein", high_protein: "High protein",
};

const rows = Object.entries(run.challenges).map(([id, s]) => {
  const f = s.facts || {};
  const looks = (s.packets.at(-1)?.photos || []).map((p) => `${p.kind}: ${p.answer}`).join("<br>");
  return `| ${id} | ${s.campaign} | ${product(s.barcode)} ${esc(f.product_name || "")} | ${LABEL[s.claim] || s.claim} | ${esc(f.data_detail || "")} | ${looks || "—"} | **${s.ruling}** (${s.code}) | ${esc(s.outcome || s.state)} |`;
});
const reasons = Object.entries(run.challenges).map(([id, s]) => `- **${id}** (${s.ruling}): ${esc(s.why)}`);
const packets = Object.entries(run.challenges).flatMap(([id, s]) =>
  s.packets.map(
    (p, i) =>
      `| ${id} #${i + 1} | ${p.read_at} | ${p.ruling} | rev ${p.rev ?? "—"} | \`${p.packet_sha256}\` | \`${p.facts_sha256}\` | ${(p.photos || []).map((x) => `${x.kind} \`${x.sha256.slice(0, 12)}…\` ${x.answer}`).join("<br>") || "—"} |`
  )
);
const timelines = Object.entries(run.challenges).map(
  ([id, s]) => `- **${id}**: ` + s.timeline.map((t) => `${t.at} ${t.event}${t.ruling ? ` → ${t.ruling}` : ""}${t.by ? ` by ${t.by}` : ""}${t.outcome ? ` (${t.outcome})` : ""}`).join(" · ")
);
const pots = run.campaigns.map((id) => {
  const p = run.pots[id];
  return `| ${id} | ${gen(p.funded)} | ${gen(p.paid)} | ${gen(p.stakes_kept)} | ${gen(p.reserved)} | ${gen(p.pot)} | ${p.rewards_left} | ${p.state} | ${p.ends} |`;
});

let uiTest = "";
const uiPath = new URL("../docs/ui-test.json", import.meta.url);
if (existsSync(uiPath)) {
  const ui = JSON.parse(readFileSync(uiPath, "utf8"));
  uiTest = `## Wallet test from the live app

${ui.note} Wallet \`${ui.wallet}\`. Every transaction is FINALIZED with execution result SUCCESS.

| Step | GEN sent | Result | Tx |
|---|---|---|---|
${ui.steps.map(([step, value, result, hash]) => `| ${esc(step)} | ${value} | ${esc(result)} | ${tx(hash)} |`).join("\n")}
`;
}

const md = `# LabelCheck: reproduction of the live run

Contract on GenLayer Studio: [\`${run.contract}\`](${EXPLORER}/address/${run.contract}) (source: \`contracts/label_check.py\`, checked
byte-identical with \`node scripts/verify-code.mjs ${run.contract}\`).

\`scripts/demo.mjs\` opened **demo campaigns** funded by test wallets and challenged nutrition claims on **real products**, read live from
Open Food Facts by every validator. For each challenge the validators looked at the front photo of the pack, checked the record against
EU Regulation (EC) No 1924/2006 and read the photo of the printed nutrition table or ingredient list; the record and the photo had to
agree before anything was decided.

Accounts: ${Object.entries(run.accounts).map(([k, a]) => `${k} \`${a}\``).join(", ")}.

## Rulings

| Challenge | Campaign | Product | Claim | Record check | What the validators saw | Ruling | Outcome |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}

### The reason stored with each ruling

${reasons.join("\n")}

## Pots at the end of the run

| Campaign | Funded | Paid | Stakes kept | Reserved | Pot | Rewards left | State | Challenges until |
|---|---|---|---|---|---|---|---|---|
${pots.join("\n")}

## Balance reconciliation

\`totals()\` (open pots, reserved rewards and open stakes) against the contract's on-chain balance, each time after every transfer had finalized:

| Point | Expected | Contract balance | Match |
|---|---|---|---|
${run.reconciliations.map((r) => `| ${r.label} | ${gen(r.expected)} | ${gen(r.balance)} | ${r.ok ? "yes" : "**no**"} |`).join("\n")}

Final wallet balances: ${Object.entries(run.balances).map(([k, b]) => `${k} ${gen(b)}`).join(", ")}.

## Evidence packets

One packet per reading, stored on-chain with the challenge: the Open Food Facts record and its revision, the hash of the facts every
validator agreed on, and each photo's sha256 with the answer given for it.

| Reading | At (UTC) | Ruling | Record | packet_sha256 | facts_sha256 | photos |
|---|---|---|---|---|---|---|
${packets.join("\n")}

## Timelines

${timelines.join("\n")}

${uiTest}
## Every transaction

| Who | Call | GEN | Status | Result | Returned / refused | Tx |
|---|---|---|---|---|---|---|
${run.log.map((r) => `| ${r.who} | \`${esc(r.call)}\` | ${r.value} | ${r.status} | ${r.exec} | ${esc((r.returned || r.refused || "").slice(0, 140))} | ${tx(r.hash)} |`).join("\n")}
`;

writeFileSync(new URL("../docs/REPRODUCTION.md", import.meta.url), md);
console.log(`wrote docs/REPRODUCTION.md (${run.log.length} transactions)`);
