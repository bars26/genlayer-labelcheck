/** Types and display helpers for the LabelCheck contract. */

export type Ruling = "UPHELD" | "REJECTED" | "UNCLEAR";
export type Answer = "MEETS" | "FAILS" | "UNCLEAR";
type Num = string | number | bigint;

export interface Campaign {
  id: string;
  sponsor: string;
  title: string;
  claims_json: string;
  countries_json: string;
  ends: string;
  reward: Num;
  stake: Num;
  per_challenger: Num;
  state: "open" | "closed";
  pot: Num;
  reserved: Num;
  funded_total: Num;
  paid_total: Num;
  stakes_kept: Num;
  stakes_open: Num;
  returnable: Num;
  returned_total: Num;
  n_funders: Num;
  n_refunded: Num;
  n_challenges: Num;
  n_upheld: Num;
  n_rejected: Num;
  n_unclear: Num;
  n_pending: Num;
  created_at: string;
  history_json: string;
  /** Not stored on the campaign: attached by the registry snapshot from get_funders. */
  funders?: FunderRow[];
}

export interface FunderRow {
  address: string;
  amount: string;
  refunded: boolean;
}

export interface Challenge {
  id: string;
  campaign_id: string;
  barcode: string;
  claim: string;
  challenger: string;
  stake: Num;
  reward: Num;
  filed_at: string;
  window_from: string;
  state: "pending" | "settled";
  ruling: Ruling;
  code: string;
  facts_json: string;
  evidence_json: string;
  why: string;
  funders_contested: boolean;
  challenger_contested: boolean;
  outcome: "" | "paid" | "stake_to_pot" | "stake_returned";
  timeline_json: string;
}

/** What every validator read and agreed on for a ruling. */
export interface ChallengeFacts {
  barcode?: string;
  claim?: string;
  product_name?: string;
  brands?: string;
  lang?: string;
  quantity?: string;
  liquid?: boolean;
  countries?: string[];
  last_modified?: string;
  rev?: number;
  rule?: string;
  nutriments?: Record<string, number | string>;
  front_answer?: Answer;
  data_answer?: Answer;
  data_detail?: string;
  photo_answer?: Answer;
  label_photo_kind?: string;
  ingredients?: string;
  campaign_countries?: string;
}

export interface PhotoLook {
  kind: string;
  url: string;
  sha256: string;
  answer: Answer;
}

/** One reading: where validators looked, what they saw, and hashes that pin it. */
export interface EvidencePacket {
  record?: string;
  source?: string;
  rev?: number;
  photos?: PhotoLook[];
  ingredients_sha256?: string;
  facts_sha256?: string;
  ruling?: Ruling;
  read_at?: string;
  packet_sha256?: string;
}

export interface TimelineStep {
  at: string;
  event: string;
  ruling?: Ruling;
  code?: string;
  by?: string;
  before?: Ruling;
  evidence?: string;
  outcome?: string;
  stake?: string;
  reward?: string;
}

export const RESPONSE_WINDOW_SECONDS = 600;
export const SETTLED_DAYS = 3;
export const MIN_WEI = 10n ** 17n;

export type ClaimCode =
  | "sugar_free" | "low_sugar" | "no_added_sugar" | "fat_free" | "low_fat" | "low_salt"
  | "source_of_fibre" | "high_fibre" | "source_of_protein" | "high_protein";

/** EU Regulation (EC) No 1924/2006, Annex: the claims LabelCheck covers, as the contract encodes them. */
export const CLAIMS: Record<ClaimCode, { label: string; kind: "nutrient" | "ingredients"; printed: string }> = {
  sugar_free: { label: "Sugar-free", kind: "nutrient", printed: "sans sucres · sin azúcares · 0% azúcares · zuckerfrei" },
  low_sugar: { label: "Low sugar", kind: "nutrient", printed: "pauvre en sucres · bajo en azúcares · zuckerarm" },
  no_added_sugar: { label: "No added sugars", kind: "ingredients", printed: "sans sucres ajoutés · sin azúcares añadidos · ohne Zuckerzusatz" },
  fat_free: { label: "Fat-free", kind: "nutrient", printed: "sans matières grasses · 0% MG · sin grasa" },
  low_fat: { label: "Low fat", kind: "nutrient", printed: "pauvre en matières grasses · bajo en grasas · fettarm" },
  low_salt: { label: "Low salt", kind: "nutrient", printed: "pauvre en sel · bajo en sal · salzarm" },
  source_of_fibre: { label: "Source of fibre", kind: "nutrient", printed: "source de fibres · fuente de fibra" },
  high_fibre: { label: "High fibre", kind: "nutrient", printed: "riche en fibres · alto contenido en fibra" },
  source_of_protein: { label: "Source of protein", kind: "nutrient", printed: "source de protéines · fuente de proteínas" },
  high_protein: { label: "High protein", kind: "nutrient", printed: "riche en protéines · alto contenido en proteínas" },
};
export const CLAIM_CODES = Object.keys(CLAIMS) as ClaimCode[];
export const claimLabel = (code: string) => CLAIMS[code as ClaimCode]?.label ?? code;

export function ruleText(claim: string, liquid: boolean): string {
  const per = liquid ? "per 100 ml" : "per 100 g";
  const rules: Record<string, string> = {
    sugar_free: `sugars ≤ 0.5 g ${per}`,
    low_sugar: `sugars ≤ ${liquid ? "2.5" : "5"} g ${per}`,
    no_added_sugar: "no added sugars or sweetening foods in the ingredients",
    fat_free: `fat ≤ 0.5 g ${per}`,
    low_fat: `fat ≤ ${liquid ? "1.5" : "3"} g ${per}`,
    low_salt: `salt ≤ 0.3 g ${per}`,
    source_of_fibre: `fibre ≥ 3 g ${per}, or ≥ 1.5 g per 100 kcal`,
    high_fibre: `fibre ≥ 6 g ${per}, or ≥ 3 g per 100 kcal`,
    source_of_protein: "protein gives ≥ 12% of the energy",
    high_protein: "protein gives ≥ 20% of the energy",
  };
  return rules[claim] ?? claim;
}

/** The same nutrient test as the contract's data_check, for the wallet-free preview. */
export function dataCheck(claim: string, n: Record<string, unknown>, liquid: boolean): { answer: "MEETS" | "FAILS" | "NO_DATA"; detail: string } {
  const num = (k: string) => {
    const raw = n[k];
    const v = Number(raw);
    return raw === undefined || raw === null || raw === "" || !Number.isFinite(v) || v < 0 ? null : v;
  };
  const g = (v: number) => `${Number(v.toFixed(4))}`;
  const atMost = (v: number | null, limit: number, name: string) =>
    v === null
      ? { answer: "NO_DATA" as const, detail: `no ${name} value` }
      : { answer: v <= limit ? ("MEETS" as const) : ("FAILS" as const), detail: `${name} ${g(v)} g, limit ${g(limit)} g` };
  const sugars = num("sugars_100g"), fat = num("fat_100g"), salt = num("salt_100g");
  const fibre = num("fiber_100g"), protein = num("proteins_100g"), kcal = num("energy-kcal_100g");
  switch (claim) {
    case "sugar_free":
      return atMost(sugars, 0.5, "sugars");
    case "low_sugar":
      return atMost(sugars, liquid ? 2.5 : 5, "sugars");
    case "fat_free":
      return atMost(fat, 0.5, "fat");
    case "low_fat":
      return atMost(fat, liquid ? 1.5 : 3, "fat");
    case "low_salt":
      return atMost(salt, 0.3, "salt");
    case "source_of_fibre":
    case "high_fibre": {
      const [grams, perKcal] = claim === "source_of_fibre" ? [3, 1.5] : [6, 3];
      if (fibre === null) return { answer: "NO_DATA", detail: "no fibre value" };
      if (fibre >= grams) return { answer: "MEETS", detail: `fibre ${g(fibre)} g, at least ${grams} g` };
      if (!kcal) return { answer: "NO_DATA", detail: `fibre ${g(fibre)} g and no energy value` };
      const d = (fibre * 100) / kcal;
      return { answer: d >= perKcal ? "MEETS" : "FAILS", detail: `fibre ${g(fibre)} g = ${d.toFixed(2)} g per 100 kcal` };
    }
    case "source_of_protein":
    case "high_protein": {
      const share = claim === "source_of_protein" ? 0.12 : 0.2;
      if (protein === null || !kcal) return { answer: "NO_DATA", detail: "no protein or energy value" };
      const part = (protein * 4) / kcal;
      return { answer: part >= share ? "MEETS" : "FAILS", detail: `protein ${g(protein)} g × 4 = ${(part * 100).toFixed(1)}% of ${g(kcal)} kcal` };
    }
  }
  return { answer: "NO_DATA", detail: "read by the validators" };
}

/** Ready-made campaigns a sponsor can start from. */
export const PRESETS: { label: string; claims: ClaimCode[]; countries: string; why: string }[] = [
  { label: "EU front-of-pack claims", claims: CLAIM_CODES, countries: "", why: "Every nutrition claim LabelCheck covers, on products sold anywhere." },
  { label: "Sugar claims", claims: ["sugar_free", "low_sugar", "no_added_sugar"], countries: "", why: "The claims shoppers trust most when cutting sugar." },
  {
    label: "Protein and fibre claims, France",
    claims: ["source_of_protein", "high_protein", "source_of_fibre", "high_fibre"],
    countries: "en:france",
    why: "The fastest-growing claims on French shelves.",
  },
];

export function wei(v: Num | undefined): bigint {
  try {
    return BigInt(String(v ?? "0").split(".")[0]);
  } catch {
    return 0n;
  }
}

export function formatGen(v: Num | undefined, digits = 2): string {
  const n = Number(wei(v)) / 1e18;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function parseGen(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function parseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const isZero = (a?: string | null) => !a || /^0x0{40}$/i.test(a);
export const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function utcMs(iso: string): number {
  if (!iso) return NaN;
  const t = iso.trim();
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(t) ? t : `${t}Z`);
}

export function windowLeftSeconds(s: Challenge, now = Date.now()): number {
  if (s.state !== "pending") return 0;
  return Math.max(0, Math.ceil(RESPONSE_WINDOW_SECONDS - (now - utcMs(s.window_from)) / 1000));
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const claimsOf = (c: Campaign) => parseJson<ClaimCode[]>(c.claims_json, []);
export const countriesOf = (c: Campaign) => parseJson<string[]>(c.countries_json, []);
export const factsOf = (s: Challenge) => parseJson<ChallengeFacts>(s.facts_json, {});
export const timelineOf = (s: Challenge) => parseJson<TimelineStep[]>(s.timeline_json, []);
export const evidenceOf = (s: Challenge) => parseJson<EvidencePacket[]>(s.evidence_json, []);
export const fundersOf = (c: Campaign): FunderRow[] => c.funders ?? [];
export const isFunder = (c: Campaign, a?: string | null) => !!a && fundersOf(c).some((f) => sameAddress(f.address, a));
export const funderRow = (c: Campaign, a?: string | null) => (a ? fundersOf(c).find((f) => sameAddress(f.address, a)) : undefined);
export const rewardsLeft = (c: Campaign) => (wei(c.reward) > 0n ? Number(wei(c.pot) / wei(c.reward)) : 0);
export const productUrl = (code: string) => `https://world.openfoodfacts.org/product/${code}`;
export const countryName = (tag: string) =>
  tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

/** Accepts a barcode or any Open Food Facts product link. */
export function barcodeFrom(input: string): string | null {
  const t = input.trim();
  const m = t.match(/product\/(\d{8,14})/) || t.match(/^(\d{8,14})$/);
  return m ? m[1] : null;
}

export const RULING_STYLE: Record<Ruling, { label: string; stamp: string; help: string }> = {
  UPHELD: { label: "Misleading", stamp: "stamp-upheld", help: "The claim is on the pack and the label does not qualify for it: stake back plus the reward." },
  REJECTED: { label: "Challenge rejected", stamp: "stamp-rejected", help: "The claim qualifies, or is not on the pack: the stake joins the pot." },
  UNCLEAR: { label: "Undecided", stamp: "stamp-unclear", help: "The record and the photos did not settle it: the stake goes back." },
};

export const OUTCOME_TEXT: Record<string, string> = {
  paid: "Stake and reward paid to the challenger",
  stake_to_pot: "Stake added to the pot",
  stake_returned: "Stake returned",
};

export const CODE_LABEL: Record<string, string> = {
  misleading: "claim not met",
  claim_met: "claim qualifies",
  not_claimed: "not on the pack",
  data_conflict: "record and photo disagree",
  recently_edited: "record edited recently",
  outside_countries: "not sold there",
  unknown_product: "no such product",
  unreachable: "Open Food Facts unreachable",
  no_front_photo: "no front photo",
  front_unclear: "front photo unclear",
  no_data: "no data on record",
  no_label_photo: "no label photo",
  label_unclear: "label photo unclear",
  upheld_cap: "challenger limit reached",
};
