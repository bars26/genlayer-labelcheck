# LabelCheck

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)

<img src="assets/labelcheck-logo.png" alt="LabelCheck logo" width="96" align="right" />

**Is the claim on the pack true? Anyone challenges a nutrition claim on a food product by barcode. GenLayer validators look at the
photos of the pack, check the numbers against EU law, and pay the challenger when the claim does not hold.**

"Sugar-free", "low salt", "high protein" are not marketing words in the EU: Regulation (EC) No 1924/2006 gives each one a legal
threshold ("sugar-free": at most 0.5 g of sugars per 100 g; "high protein": protein gives at least 20% of the energy). Checking a pack
means reading the front, the nutrition table and sometimes the ingredient list, and nobody pays shoppers to do it.
[Open Food Facts](https://world.openfoodfacts.org) already holds millions of products with photos of every side of the pack, typed
in by volunteers. LabelCheck turns that into a contract:

1. A **sponsor** (a consumer group, a regulator, a journalist) opens a **campaign**: which claims it pays for, optionally which
   countries the product must be sold in, a **reward** per misleading claim, a **stake** per challenge and a last day. Anyone adds GEN.
2. **Anyone challenges** a product's claim by **barcode**, with the campaign's stake.
3. **Every validator** reads the product from Open Food Facts and:
   - **looks at the front photo**: is that claim really printed, in any language? A comparative claim ("-25% salt") is not the absolute
     one ("low salt"), so it does not count;
   - **checks the record against the law in code**: nutrients per 100 g, or per 100 ml for drinks (for "no added sugars", validators read
     the ingredient list for sugars and sweetening foods);
   - **reads the photo of the printed nutrition table or ingredient list** and answers the same question.
4. **The record and the photo must agree.** Both fail: **misleading**, the challenger gets the stake back plus the reward. Both meet:
   **rejected**, the stake joins the pot. They disagree, or anything is unreadable: **undecided**, the stake goes back. A typo in a
   volunteer-edited record never convicts a product.
5. The side a ruling goes against has **10 minutes** to ask once for a fresh reading. Every ruling stores a **plain-English reason**, a
   **timeline** and an **evidence packet** with the record revision and the sha256 of every photo looked at. After the last day anyone
   **closes** the campaign and **returns each funder's share** of the pot (including kept stakes), one funder per transaction.

**Live app:** [labelcheck-bars26.vercel.app](https://labelcheck-bars26.vercel.app). Paste any barcode and see, without a wallet, what the
contract would check. Writes need MetaMask on GenLayer Studio (chain 61999); **Test GEN** funds your wallet.

**Contract:** [`0x137614E1D13Ade8D9eBeF98cE3f512Ab3C589DF9`](https://explorer-studio.genlayer.com/address/0x137614E1D13Ade8D9eBeF98cE3f512Ab3C589DF9) on GenLayer Studio.

## Why GenLayer

- **Looking at the pack.** Whether a claim is printed, and whether "-25% de sel" is the claim "low salt", is in the image, not in any
  field. Each validator looks at the photo itself; answers come from a fixed set (`MEETS`, `FAILS`, `UNCLEAR`), so agreement is strict.
- **Reading the printed label.** Each validator reads the nutrition table or the ingredient list from the photo, one photo per prompt, and
  must agree with the others and with the record before money moves.
- **Rules where rules belong.** The legal thresholds are code, applied to the same record by every validator; the model never decides a
  number the record already holds.

## Verified live, on real products

`scripts/demo.mjs` opened demo campaigns with test wallets and challenged claims on real products. Every transaction, reason, evidence
packet and the balance reconciliation are in [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md).

| Product (Open Food Facts) | Claim on the pack | What the validators found | Ruling |
|---|---|---|---|
| [Santiveri cocoa biscuits](https://world.openfoodfacts.org/product/8412170028579) | "0% azúcares" (**sugar-free**) | Claim printed on the front; record **0.6 g** of sugars per 100 g, and the printed table says the same; the limit is 0.5 g | **Misleading**: stake back plus 0.5 GEN. A co-funder's fresh reading confirmed it; a second challenge of the same claim was refused |
| [Gullón Zero fibre biscuits](https://world.openfoodfacts.org/product/8410376009392) | "sugar free" | The record says **5 g** of sugars; the printed table says **<0.5 g**: a typo in the record | **Undecided** (record and photo disagree): stake back. The challenger's fresh reading agreed |
| [Fleury Michon chicken breast](https://world.openfoodfacts.org/product/3095757697105) | "-25% de sel" | Validators looked at the front: a comparative "-25% salt" is not the claim **low salt** | **Rejected** (not on the pack): stake to the pot |
| [Pom'Potes apple pouch](https://world.openfoodfacts.org/product/3021769505602) | "sans sucres ajoutés" (**no added sugars**) | Apple, apple purée, lemon juice for acidity, in the record and on the printed list | **Rejected** (claim qualifies) |
| [Alpro soy peach & passion fruit](https://world.openfoodfacts.org/product/5411188113416) | "bajo en grasas" (**low fat**) | 1.9 g of fat per 100 g in the record and the printed table; the limit is 3 g | **Rejected** (claim qualifies) |
| Santiveri, in a **UK-only** campaign | "0% azúcares" | Open Food Facts lists it in Spain and France only | **Rejected** (not sold there), decided in code |

Also refused on-chain, with the GEN sent back: an unknown claim code, a last day of 2026-02-31, a country written "Spain" instead of a
tag, a reward below 0.1 GEN, a pot smaller than one reward, a 0.05 GEN top-up, a second open challenge on the same claim, a wrong stake,
and the sponsor challenging their own campaign. And refused by the contract: the challenger paying out early (only a funder can) and
closing a campaign before its last day. The contract's balance was reconciled with `totals()` (open pots, reserved rewards and open
stakes) at four points of the run, each time after every transfer had finalized.

## Who can do what (and the attacks this blocks)

| Rule | Why |
|---|---|
| A ruling needs the front photo, the record and the label photo; the record and the label photo must agree | Volunteers edit Open Food Facts: a wrong number in the record decides nothing on its own |
| Records edited in the last 3 days are not read (`UNCLEAR`, stake back) | A challenger cannot edit the record and challenge it at once |
| The claim must be printed on the front, judged from the photo; comparative claims are not the absolute claim | Nobody earns a reward for a claim the brand never made |
| Thresholds are EU Regulation 1924/2006, per 100 g or per 100 ml, in code | Every validator gets the same answer from the same record |
| One open challenge per product and claim, one upheld at most, three tries per campaign; a funder never challenges their own campaign; a per-challenger cap | Nobody farms the same claim, and the sponsor cannot pay itself |
| Early settlement only against your own interest (a funder pays now, the challenger accepts a rejection) | The challenger cannot rush a payout; funders cannot rush a rejection |
| Photos are read only from `images.openfoodfacts.org`, at most 6 MB; Open Food Facts outages are `UNCLEAR` | An outage or an odd URL never decides a challenge |
| Funders, per-challenger counts and tries live in their own maps; top-ups are at least 0.1 GEN; closing does a fixed amount of work and each funder is repaid by their own `refund` | No campaign can grow so large that closing it strands the funders' GEN |
| Payable calls never revert; they refund and return `REFUNDED: <reason>`, including dates that do not exist (2026-02-31) | GenLayer keeps the value of a reverted call |

## The app

- **Check a label:** paste a barcode or an Open Food Facts link: the front and label photos, the nutrition record, and for any open
  campaign and claim the same checks as the contract (the photo checks are marked as the validators' job), with the reward. One click
  challenges.
- **Every campaign** shows its claims, countries, reward, stake, how much of the pot is paid, reserved and free, a challenge box and a fund
  box; closed campaigns show each funder's share and a button to return it.
- **Every challenge** shows the front of the pack, the ruling as a stamp with its reason, the window countdown with the actions your wallet
  can take, and **what the validators read**: the rule, the record check, each photo with the answer under it, the evidence packet hashes
  and the timeline.
- **Studio's 30 requests per minute:** page loads read the registry server-side (one `get_campaigns`, one `get_challenges` and each
  campaign's funders), CDN-cached; Open Food Facts is read straight from the browser.

## Run it

```bash
pip install -r requirements.txt
genvm-lint check contracts/label_check.py
pytest tests/direct/ -v                     # 56 tests: Open Food Facts, the photos and the LLM mocked

npm install
node scripts/deploy.mjs
node scripts/verify-code.mjs <address>
node scripts/demo.mjs <address>             # the live run above (about 40 minutes)
node scripts/reproduction.mjs               # regenerate docs/REPRODUCTION.md

cd frontend && cp .env.example .env.local && npm run dev
```

## Limits, stated plainly

- LabelCheck rules on a product's **Open Food Facts record and photos**, not on the pack on a shelf today. Recipes change; old photos may
  show an old pack. A brand that fixed its pack can update the photos, and the record must settle for 3 days before it is read again.
- It covers ten absolute claims from the EU annex. Comparative claims ("reduced", "-30%"), health claims and the conditions of use that
  need more than a label (such as "naturally occurring sugars" wording) are out of scope.
- The ingredient test for "no added sugars" is a model's reading of a list; validators must agree, and a disagreement with the record is
  undecided, never upheld.
- A ruling is evidence for a campaign's reward, not a legal finding.
- The demo campaigns are funded by test wallets; the challenger is a test wallet.

Product records and photos come from Open Food Facts (ODbL database, CC BY-SA photos), shown with a link to each product.

MIT licensed.
