# LabelCheck: reproduction of the live run

Contract on GenLayer Studio: [`0x137614E1D13Ade8D9eBeF98cE3f512Ab3C589DF9`](https://explorer-studio.genlayer.com/address/0x137614E1D13Ade8D9eBeF98cE3f512Ab3C589DF9) (source: `contracts/label_check.py`, checked
byte-identical with `node scripts/verify-code.mjs 0x137614E1D13Ade8D9eBeF98cE3f512Ab3C589DF9`).

`scripts/demo.mjs` opened **demo campaigns** funded by test wallets and challenged nutrition claims on **real products**, read live from
Open Food Facts by every validator. For each challenge the validators looked at the front photo of the pack, checked the record against
EU Regulation (EC) No 1924/2006 and read the photo of the printed nutrition table or ingredient list; the record and the photo had to
agree before anything was decided.

Accounts: sponsor `0xF0d9D5Bd139fE417Ebc6e87836EE60374f18b82c`, cofunder `0x6A3aE1977642E0eFD9ea81053012bd9978D6F647`, shopper `0xb023E5791025Dd917fFc8c337a95aF4757A305b4`, bystander `0x0E212d3DB3d67A9A19946B7621c02ce7749892Ef`.

## Rulings

| Challenge | Campaign | Product | Claim | Record check | What the validators saw | Ruling | Outcome |
|---|---|---|---|---|---|---|---|
| challenge_0 | campaign_0 | [8412170028579](https://world.openfoodfacts.org/product/8412170028579) Galletas cacao | Sugar-free | sugars 0.6 g, limit 0.5 g | front: MEETS<br>nutrition table: FAILS | **UPHELD** (misleading) | paid |
| challenge_1 | campaign_0 | [8410376009392](https://world.openfoodfacts.org/product/8410376009392) gullon fibre zero sugar free | Sugar-free | sugars 5 g, limit 0.5 g | front: MEETS<br>nutrition table: MEETS | **UNCLEAR** (data_conflict) | stake_returned |
| challenge_2 | campaign_0 | [3095757697105](https://world.openfoodfacts.org/product/3095757697105) Blanc de Poulet  - 25% de Sel* | Low salt |  | front: FAILS | **REJECTED** (not_claimed) | stake_to_pot |
| challenge_3 | campaign_0 | [3021769505602](https://world.openfoodfacts.org/product/3021769505602) POM'POTES Compotes Gourdes Pomme Nature 1x90g | No added sugars | ingredient list as recorded | front: MEETS<br>ingredient list: MEETS | **REJECTED** (claim_met) | stake_to_pot |
| challenge_4 | campaign_0 | [5411188113416](https://world.openfoodfacts.org/product/5411188113416) Especialidad vegetal de soja melocotón y piña con fruta de la pasión | Low fat | fat 1.9 g, limit 3 g | front: MEETS<br>nutrition table: MEETS | **REJECTED** (claim_met) | stake_to_pot |
| challenge_5 | campaign_1 | [8412170028579](https://world.openfoodfacts.org/product/8412170028579) Galletas cacao | Sugar-free |  | — | **REJECTED** (outside_countries) | stake_to_pot |

### The reason stored with each ruling

- **challenge_0** (UPHELD): Galletas cacao carries the claim "Sugar-free", which EU law allows only with sugars of at most 0.5 g per 100 g. The Open Food Facts record (sugars 0.6 g, limit 0.5 g) and the photo of the nutrition table both show it does not qualify.
- **challenge_1** (UNCLEAR): The Open Food Facts record and the photo of the nutrition table of gullon fibre zero sugar free disagree (record: FAILS, photo: MEETS), so nothing is decided; the stake goes back.
- **challenge_2** (REJECTED): Validators looked at the front of Blanc de Poulet  - 25% de Sel* and it does not carry the claim "Low salt".
- **challenge_3** (REJECTED): POM'POTES Compotes Gourdes Pomme Nature 1x90g carries the claim "No added sugars" and qualifies: the Open Food Facts record (ingredient list as recorded) and the photo of the ingredient list both meet no added mono- or disaccharides and no other food used for its sweetening properties (sugar, syrups, honey, dextrose, malt extract, fruit juice concentrates added to sweeten).
- **challenge_4** (REJECTED): Especialidad vegetal de soja melocotón y piña con fruta de la pasión carries the claim "Low fat" and qualifies: the Open Food Facts record (fat 1.9 g, limit 3 g) and the photo of the nutrition table both meet fat of at most 3 g per 100 g.
- **challenge_5** (REJECTED): Galletas cacao is not sold in the countries this campaign covers (en:united-kingdom).

## Pots at the end of the run

| Campaign | Funded | Paid | Stakes kept | Reserved | Pot | Rewards left | State | Challenges until |
|---|---|---|---|---|---|---|---|---|
| campaign_0 | 4 GEN | 0.5 GEN | 0.3 GEN | 0 GEN | 3.8 GEN | 7 | open | 2027-01-01 |
| campaign_1 | 1 GEN | 0 GEN | 0.1 GEN | 0 GEN | 1.1 GEN | 4 | open | 2027-01-01 |

## Balance reconciliation

`totals()` (open pots, reserved rewards and open stakes) against the contract's on-chain balance, each time after every transfer had finalized:

| Point | Expected | Contract balance | Match |
|---|---|---|---|
| after the refused campaigns: the contract kept nothing | 0 GEN | 0 GEN | yes |
| campaign 0 open, Santiveri's reward reserved | 4.5 GEN | 4.5 GEN | yes |
| both campaigns open | 5.6 GEN | 5.6 GEN | yes |
| end of run | 4.9 GEN | 4.9 GEN | yes |

Final wallet balances: sponsor 16 GEN, cofunder 4 GEN, shopper 3.1 GEN, bystander 1 GEN.

## Evidence packets

One packet per reading, stored on-chain with the challenge: the Open Food Facts record and its revision, the hash of the facts every
validator agreed on, and each photo's sha256 with the answer given for it.

| Reading | At (UTC) | Ruling | Record | packet_sha256 | facts_sha256 | photos |
|---|---|---|---|---|---|---|
| challenge_0 #1 | 2026-11-02T05:50:03 | UPHELD | rev 87 | `117510fbaf8da5587345d101b10f04408ceee82cd442d4c773017a2df9baad0c` | `af7048ede10d1bd5ebbe9a1bfca3fdc2a149731a8a684a58e0dfd34991f8cdf1` | front `e746e1c6c8bb…` MEETS<br>nutrition table `db5370c33a78…` FAILS |
| challenge_0 #2 | 2026-11-02T05:53:55 | UPHELD | rev 87 | `03409e8072ac5e4a5d4f93377822d21f80c37f494bd76dc6447ff68db7fcd706` | `af7048ede10d1bd5ebbe9a1bfca3fdc2a149731a8a684a58e0dfd34991f8cdf1` | front `e746e1c6c8bb…` MEETS<br>nutrition table `db5370c33a78…` FAILS |
| challenge_1 #1 | 2026-11-02T05:50:53 | UNCLEAR | rev 258 | `9867745ac3aee64dbe1a6af881f8518f1cccb00dc250d792cf85280ea8a7c3ef` | `e7af5f10bc44681e1c60644e985e74ef3d4ca0a713e809795ce09fb6c968f0e6` | front `9b83fd0f5156…` MEETS<br>nutrition table `9fa8306acf51…` MEETS |
| challenge_1 #2 | 2026-11-02T05:55:15 | UNCLEAR | rev 258 | `b947f4b471abf8a9b5d6058d17134dfd4b1f89cbc0fc13b828a799900651aeb9` | `e7af5f10bc44681e1c60644e985e74ef3d4ca0a713e809795ce09fb6c968f0e6` | front `9b83fd0f5156…` MEETS<br>nutrition table `9fa8306acf51…` MEETS |
| challenge_2 #1 | 2026-11-02T05:51:58 | REJECTED | rev 1183 | `6a90fc8de36514d4ca44d68c0927f3a2509115efd8a7471661cb6f37f4ebdb68` | `55d0b6e78f785e9ce940d6616f9b8f05d613d531166037b4953fd9b8797036fc` | front `d39249cb1d8a…` FAILS |
| challenge_3 #1 | 2026-11-02T05:52:16 | REJECTED | rev 193 | `f70fdeb177b77005b3c3005d793ee4151e39530739783e64177be8f86a0202fb` | `115a989a0859850d48a229674d2572eba3566d64295ca01c826ba42bdf326e32` | front `66fe7f26b7a4…` MEETS<br>ingredient list `3b0f5c5ae3f4…` MEETS |
| challenge_4 #1 | 2026-11-02T05:52:45 | REJECTED | rev 101 | `4afc55a6d4412e79855016608f757d62ec7ee98c0c5b506c03891a5051d2d728` | `4b0f2397af59fbd9ce1776a8b2455a71f9f15e4a154f5a4b90f2ab7ba0105167` | front `65bc7dabf393…` MEETS<br>nutrition table `71ce5bb4c1c0…` MEETS |
| challenge_5 #1 | 2026-11-02T05:56:37 | REJECTED | rev 87 | `7c2f05884694ab240072ac8e487d1e2d31ff82e26bfbfa09c646a64dad208847` | `235032caa053ba1840e694f4506cc6df51b831595d48141de984eba13f554938` | — |

## Timelines

- **challenge_0**: 2026-11-02T05:50:03 filed → UPHELD · 2026-11-02T05:53:55 contested → UPHELD by funder · 2026-11-02T06:08:06 settled (paid)
- **challenge_1**: 2026-11-02T05:50:53 filed → UNCLEAR · 2026-11-02T05:55:15 contested → UNCLEAR by challenger · 2026-11-02T06:08:13 settled (stake_returned)
- **challenge_2**: 2026-11-02T05:51:58 filed → REJECTED · 2026-11-02T05:55:39 settled (stake_to_pot)
- **challenge_3**: 2026-11-02T05:52:16 filed → REJECTED · 2026-11-02T06:08:20 settled (stake_to_pot)
- **challenge_4**: 2026-11-02T05:52:45 filed → REJECTED · 2026-11-02T06:08:26 settled (stake_to_pot)
- **challenge_5**: 2026-11-02T05:56:37 filed → REJECTED · 2026-11-02T06:08:33 settled (stake_to_pot)

## Wallet test from the live app

MetaMask test from the production app (labelcheck-bars26.vercel.app): the tester checks barcode 5013665115571 (Whole Earth peanut butter, "sans sucres ajoutés" on the front) in the wallet-free checker, challenges its "No added sugars" claim in campaign_0 with the 0.1 GEN stake, and accepts the ruling at once. Wallet `0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf`. Every transaction is FINALIZED with execution result SUCCESS.

| Step | GEN sent | Result | Tx |
|---|---|---|---|
| Challenge: campaign_0, barcode 5013665115571, claim no_added_sugar, from the "Check a label" panel | 0.1 GEN | challenge_6 REJECTED (claim_met): validators saw the claim on the front (MEETS) and read the recorded ingredients and the photo of the ingredient list (roasted peanuts 99%, sea salt) as containing no added sugar (MEETS both) | [`0x02539fac…`](https://explorer-studio.genlayer.com/tx/0x02539fac226b688db901a5b41fce0eb8eb5759c022878d21370e856c9e3b479e) |
| Accept the ruling (challenger, inside the window) |  | settled: stake_to_pot, the 0.1 GEN stake joined campaign_0's pot | [`0x2d28c2fe…`](https://explorer-studio.genlayer.com/tx/0x2d28c2fe9176401095a8cb499b1bc5524d55cbc8c03a151b550b24eac2da09e5) |

## Every transaction

| Who | Call | GEN | Status | Result | Returned / refused | Tx |
|---|---|---|---|---|---|---|
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,tasty", "", "2027-01-01", 0.5 GEN, 0.1 GEN, 5)` | 2 | ACCEPTED | SUCCESS | REFUNDED: claims must be distinct codes from: sugar_free, low_sugar, no_added_sugar, fat_free, low_fat, low_salt, source_of_fibre, high_fibr | [`0xc54da8a4…`](https://explorer-studio.genlayer.com/tx/0xc54da8a491322b6bac322dd38d72d9bd4853eb38901f82de1638b9feab036517) |
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_sa, "", "2026-02-31", 0.5 GEN, 0.1 GEN, 5)` | 2 | ACCEPTED | SUCCESS | REFUNDED: ends must be a real calendar date written YYYY-MM-DD | [`0x2f30ee64…`](https://explorer-studio.genlayer.com/tx/0x2f30ee6497d334ca9fa90f464a669ac49c0b651f54b2ee5392ccba1c53481560) |
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_sa, "Spain", "2027-01-01", 0.5 GEN, 0.1 GEN, 5)` | 2 | ACCEPTED | SUCCESS | REFUNDED: countries must be up to 10 Open Food Facts country tags like en:france, or empty | [`0x2a4b609a…`](https://explorer-studio.genlayer.com/tx/0x2a4b609aaecb377c3d74498992c61ffb2ba1c5bd0e8e02f9cbbff427d12583a2) |
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_sa, "", "2027-01-01", 0.05 GEN, 0.1 GEN, 5)` | 2 | ACCEPTED | SUCCESS | REFUNDED: reward must be at least 0.1 GEN | [`0x963fb2d2…`](https://explorer-studio.genlayer.com/tx/0x963fb2d2b521bc269b5595fd605534f6e9d23286f0eb1440db467170995245dc) |
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_sa, "", "2027-01-01", 1 GEN, 0.1 GEN, 5)` | 0.5 | ACCEPTED | SUCCESS | REFUNDED: fund the campaign with at least one reward | [`0x1b49d28f…`](https://explorer-studio.genlayer.com/tx/0x1b49d28f654d4b3cd042071f5fb80142e70844d488a5b24f7f7b1ac5c59723a3) |
| sponsor | `create_campaign("EU front-of-pack claims", "sugar_free,low_sugar,no_added_sugar,fat_free,low_fat,low_sa, "", "2027-01-01", 0.5 GEN, 0.1 GEN, 5)` | 3 | ACCEPTED | SUCCESS | campaign_0 | [`0x7aeef66c…`](https://explorer-studio.genlayer.com/tx/0x7aeef66c2e01f4fa26eeda79600ad2924623df9bdc8df0154a9040bba7ac96a9) |
| cofunder | `fund("campaign_0")` | 1 | ACCEPTED | SUCCESS | funded | [`0xad3bc308…`](https://explorer-studio.genlayer.com/tx/0xad3bc3082848ad0c4c0ece0d4e0ec69cab4b4bb3becfe5980883ce1fad9367ed) |
| bystander | `fund("campaign_0")` | 0.05 | ACCEPTED | SUCCESS | REFUNDED: Send at least 0.1 GEN to fund the campaign | [`0xae1186b5…`](https://explorer-studio.genlayer.com/tx/0xae1186b52c0702cc9a8507f2c429ba49bfd9b234ff5db1242360db20769eedba) |
| shopper | `challenge("campaign_0", "8412170028579", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | challenge_0 | [`0xf74dba3f…`](https://explorer-studio.genlayer.com/tx/0xf74dba3f3eeff96a15e31311bffbeb2158a144566218ee453b35d560e4a06cb7) |
| shopper | `challenge("campaign_0", "8410376009392", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | challenge_1 | [`0x30abd637…`](https://explorer-studio.genlayer.com/tx/0x30abd6376d582d610946617bbb391633684026452abf7f84e49f668e87935158) |
| shopper | `challenge("campaign_0", "3095757697105", "low_salt")` | 0.1 | ACCEPTED | SUCCESS | challenge_2 | [`0x411f2eae…`](https://explorer-studio.genlayer.com/tx/0x411f2eae78b5f0b9bc1c029006d412618b505972dbe4988480b786932f813373) |
| shopper | `challenge("campaign_0", "3021769505602", "no_added_sugar")` | 0.1 | ACCEPTED | SUCCESS | challenge_3 | [`0xb46c2ad3…`](https://explorer-studio.genlayer.com/tx/0xb46c2ad386df9ee8c2477e4fdeb5b2b02a8857096b0c45067351398c770b63f1) |
| shopper | `challenge("campaign_0", "5411188113416", "low_fat")` | 0.1 | ACCEPTED | SUCCESS | challenge_4 | [`0xd490f889…`](https://explorer-studio.genlayer.com/tx/0xd490f88947bc6bf5f0ec42b6dc78be2f760a1899b25570b6023e4e8868bee2d2) |
| shopper | `challenge("campaign_0", "8412170028579", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | REFUNDED: challenge_0 on this product and claim is still open | [`0x53c0a68e…`](https://explorer-studio.genlayer.com/tx/0x53c0a68e9ce42920bf2865dc02679a2701b83d6c0ad686caaa9c238b73214c84) |
| shopper | `challenge("campaign_0", "8412170028579", "high_protein")` | 0.2 | ACCEPTED | SUCCESS | REFUNDED: A challenge in campaign_0 stakes exactly 100000000000000000 wei | [`0x2c177e9b…`](https://explorer-studio.genlayer.com/tx/0x2c177e9b1a33fa4f9b87bbe345f9bcde89d2676bb91c709b1def65b9985196b2) |
| sponsor | `challenge("campaign_0", "3017624010701", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | REFUNDED: A funder cannot be paid by their own campaign | [`0xcb07ad30…`](https://explorer-studio.genlayer.com/tx/0xcb07ad302098583350856c19f202a6c576f20b06228dd2c7ce0754512c4c7e36) |
| shopper | `settle("challenge_0")` | 0 | ACCEPTED | ERROR | The response window is still open; only a funder can pay early | [`0xb7d2422a…`](https://explorer-studio.genlayer.com/tx/0xb7d2422ad0adb12f40f0f2708a2826516c0daa8356e47155b52d3ed3df51ee61) |
| cofunder | `contest("challenge_0")` | 0 | ACCEPTED | SUCCESS | UPHELD | [`0xe81358ef…`](https://explorer-studio.genlayer.com/tx/0xe81358ef092f132980fec8bac63477c248690edcbbb3597fd2925e1a30b0f01d) |
| shopper | `contest("challenge_1")` | 0 | ACCEPTED | SUCCESS | UNCLEAR | [`0x4b76558d…`](https://explorer-studio.genlayer.com/tx/0x4b76558d53f08b3a7a2245a27c39039bd60ae38a111b39fef9bb58023b94b216) |
| shopper | `settle("challenge_2")` | 0 | ACCEPTED | SUCCESS | stake_to_pot | [`0x3ac3115c…`](https://explorer-studio.genlayer.com/tx/0x3ac3115c90f060c6f268e2baff3bc2dae5dcb1cd9f06c690a4f19578c42aed84) |
| sponsor | `create_campaign("UK sugar claims", "sugar_free,low_sugar,no_added_sugar", "en:united-kingdom", "2027-01-01", 0.25 GEN, 0.1 GEN, 2)` | 1 | ACCEPTED | SUCCESS | campaign_1 | [`0x1914d3a6…`](https://explorer-studio.genlayer.com/tx/0x1914d3a6554d6468115a7474d700bfde9a819ebf4bc4eb06846d1f98c4abeaed) |
| shopper | `challenge("campaign_1", "8412170028579", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | challenge_5 | [`0xfe1dd335…`](https://explorer-studio.genlayer.com/tx/0xfe1dd335b241eeb75c4f1617c5f9c7b3f81c44962bef420f97cdd537d2e50fc5) |
| bystander | `close("campaign_1")` | 0 | ACCEPTED | ERROR | Challenges can be filed until 2027-01-01 | [`0xce5b65ff…`](https://explorer-studio.genlayer.com/tx/0xce5b65ff08ae2ae85961401896ddc3dc9be1f5133512c79531e9a2b2a37bbdab) |
| bystander | `settle("challenge_0")` | 0 | ACCEPTED | SUCCESS | paid | [`0x7b8e6262…`](https://explorer-studio.genlayer.com/tx/0x7b8e6262e499512c8f40fac324a9c81479206a35b1ae75d347e285d1abed323a) |
| bystander | `settle("challenge_1")` | 0 | ACCEPTED | SUCCESS | stake_returned | [`0x0aebd96d…`](https://explorer-studio.genlayer.com/tx/0x0aebd96dc2e83d37f2ef02568ad6d4bb136a815fca8cc9c004de13c6fd4fceef) |
| bystander | `settle("challenge_3")` | 0 | ACCEPTED | SUCCESS | stake_to_pot | [`0x21df5e23…`](https://explorer-studio.genlayer.com/tx/0x21df5e2339c3a7df508712b9defcffbd54f04fab36e950b075d30e206068700a) |
| bystander | `settle("challenge_4")` | 0 | ACCEPTED | SUCCESS | stake_to_pot | [`0x87060393…`](https://explorer-studio.genlayer.com/tx/0x87060393dbf96d60d5b05eb20bec6ac7dbb83c59e60d0139e1e9d063ee92544d) |
| bystander | `settle("challenge_5")` | 0 | ACCEPTED | SUCCESS | stake_to_pot | [`0xa7f994a1…`](https://explorer-studio.genlayer.com/tx/0xa7f994a109df77a9efb7c636089f0adb08ebc71f30e928b6307dedb7347c3b8d) |
| shopper | `challenge("campaign_0", "8412170028579", "sugar_free")` | 0.1 | ACCEPTED | SUCCESS | REFUNDED: This claim on this product was already upheld (challenge_0) | [`0x6472e77f…`](https://explorer-studio.genlayer.com/tx/0x6472e77f5158704ce0b49313de6bf45555a8a80c7e4a6302fdd05fc0e49bd20f) |
