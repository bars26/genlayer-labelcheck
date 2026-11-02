/** Browser reads of Open Food Facts (public API, CORS allowed), shaped the way the contract reads them. */

import { dataCheck, ruleText, SETTLED_DAYS, CLAIMS, type ClaimCode, type Campaign, claimsOf, countriesOf } from "./contracts/types";

const OFF = "https://world.openfoodfacts.org";
const FIELDS =
  "code,product_name,brands,lang,quantity,product_quantity_unit,countries_tags,last_modified_t,rev,nutriments,ingredients_text,image_front_url,image_nutrition_url,image_ingredients_url";

export interface Product {
  code: string;
  name: string;
  brands: string;
  lang: string;
  quantity: string;
  liquid: boolean;
  countries: string[];
  lastModified: string;
  settled: boolean;
  rev: number;
  nutriments: Record<string, unknown>;
  ingredients: string;
  front?: string;
  nutrition?: string;
  ingredientsPhoto?: string;
}

export async function getProduct(code: string): Promise<Product | null> {
  const res = await fetch(`${OFF}/api/v2/product/${code}.json?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = await res.json();
  const p = body?.product;
  if (Number(body?.status) !== 1 || !p) return null;
  const unit = String(p.product_quantity_unit || "").toLowerCase();
  const modified = Number(p.last_modified_t || 0);
  return {
    code: String(p.code || code),
    name: String(p.product_name || ""),
    brands: String(p.brands || ""),
    lang: String(p.lang || ""),
    quantity: String(p.quantity || ""),
    liquid: ["ml", "cl", "l"].includes(unit) || /\d\s*(ml|cl|l)\b/.test(String(p.quantity || "").toLowerCase()),
    countries: Array.isArray(p.countries_tags) ? p.countries_tags.map(String) : [],
    lastModified: modified ? new Date(modified * 1000).toISOString().slice(0, 10) : "",
    settled: !!modified && Date.now() / 1000 - modified >= SETTLED_DAYS * 86400,
    rev: Number(p.rev || 0),
    nutriments: p.nutriments || {},
    ingredients: String(p.ingredients_text || ""),
    front: p.image_front_url || undefined,
    nutrition: p.image_nutrition_url || undefined,
    ingredientsPhoto: p.image_ingredients_url || undefined,
  };
}

export type Step = { label: string; state: "ok" | "no" | "maybe" | "eye"; detail: string };

/** What the contract would check for one claim of one campaign: the code parts here, the photo parts left to validators. */
export function preview(p: Product, campaign: Campaign, claim: ClaimCode): { verdict: "candidate" | "qualifies" | "out" | "wait"; steps: Step[] } {
  const steps: Step[] = [];
  const countries = countriesOf(campaign);
  const inCountries = countries.length === 0 || countries.some((c) => p.countries.includes(c));
  steps.push({ label: "Sold where the campaign applies", state: inCountries ? "ok" : "no", detail: countries.length ? countries.join(", ") : "anywhere" });
  steps.push({ label: `Record unchanged for ${SETTLED_DAYS} days`, state: p.settled ? "ok" : "maybe", detail: p.lastModified ? `last edited ${p.lastModified}` : "no edit date" });
  steps.push({ label: `"${CLAIMS[claim].label}" printed on the front`, state: p.front ? "eye" : "maybe", detail: p.front ? "validators look at the front photo" : "no front photo on record" });
  let data: ReturnType<typeof dataCheck> | null = null;
  if (CLAIMS[claim].kind === "ingredients") {
    steps.push({ label: "Ingredient list on record", state: p.ingredients ? "eye" : "maybe", detail: p.ingredients ? "validators read it for added sugars" : "no ingredient list" });
  } else {
    data = dataCheck(claim, p.nutriments, p.liquid);
    steps.push({
      label: `Record: ${ruleText(claim, p.liquid)}`,
      state: data.answer === "MEETS" ? "ok" : data.answer === "FAILS" ? "no" : "maybe",
      detail: data.detail,
    });
  }
  const photo = CLAIMS[claim].kind === "ingredients" ? p.ingredientsPhoto : p.nutrition;
  steps.push({
    label: `Photo of the ${CLAIMS[claim].kind === "ingredients" ? "ingredient list" : "nutrition table"} agrees`,
    state: photo ? "eye" : "maybe",
    detail: photo ? "validators read the printed label" : "no label photo on record",
  });
  const verdict = !inCountries
    ? "out"
    : !p.settled || !p.front || !photo
      ? "wait"
      : data?.answer === "FAILS"
        ? "candidate"
        : data?.answer === "MEETS"
          ? "qualifies"
          : CLAIMS[claim].kind === "ingredients"
            ? "candidate"
            : "wait";
  return { verdict, steps };
}

export const campaignClaims = (c: Campaign) => claimsOf(c);
