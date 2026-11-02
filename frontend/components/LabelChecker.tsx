"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Loader2, ScanBarcode, X, Minus } from "lucide-react";
import {
  CLAIMS,
  barcodeFrom,
  claimsOf,
  countryName,
  formatGen,
  isFunder,
  productUrl,
  todayUtc,
  wei,
  type Campaign,
  type Challenge,
  type ClaimCode,
} from "@/lib/contracts/types";
import { getProduct, preview, type Step } from "@/lib/off";
import { useLabelCheckWrite } from "@/lib/hooks/useLabelCheck";
import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "./ui/button";

const SAMPLES = [
  { code: "8412170028579", label: "Santiveri '0% azúcares'" },
  { code: "8410376009392", label: "Gullón 'sugar free'" },
  { code: "3095757697105", label: "Fleury Michon '-25% de sel'" },
];

const NUTRIENTS: [string, string][] = [
  ["energy-kcal_100g", "Energy (kcal)"],
  ["fat_100g", "Fat"],
  ["sugars_100g", "Sugars"],
  ["fiber_100g", "Fibre"],
  ["proteins_100g", "Protein"],
  ["salt_100g", "Salt"],
];

export function StepIcon({ state }: { state: Step["state"] }) {
  if (state === "ok") return <span className="chip-ok"><Check className="h-3 w-3" strokeWidth={3} /></span>;
  if (state === "no") return <span className="chip-no"><X className="h-3 w-3" strokeWidth={3} /></span>;
  if (state === "eye") return <span className="chip-eye"><Eye className="h-3 w-3" /></span>;
  return <span className="chip-maybe"><Minus className="h-3 w-3" strokeWidth={3} /></span>;
}

export function LabelChecker({ campaigns, challenges }: { campaigns: Campaign[]; challenges: Challenge[] }) {
  const [input, setInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const product = useQuery({ queryKey: ["off", code], enabled: !!code, staleTime: 300_000, queryFn: () => getProduct(code!) });
  const open = campaigns.filter((c) => c.state === "open" && todayUtc() <= c.ends);
  const [campaignId, setCampaignId] = useState<string>("");
  const campaign = open.find((c) => c.id === campaignId) ?? open[0];
  const claims = campaign ? claimsOf(campaign) : [];
  const [claim, setClaim] = useState<ClaimCode | "">("");
  const { address, isConnected } = useWallet();
  const { writeAsync, pending } = useLabelCheckWrite();
  const p = product.data;

  // Pick the claim the record most likely breaks, so the preview starts somewhere useful.
  useEffect(() => {
    if (!p || !campaign) return;
    const ranked = claimsOf(campaign).map((c) => ({ c, v: preview(p, campaign, c).verdict }));
    const best = ranked.find((r) => r.v === "candidate") ?? ranked[0];
    setClaim(best ? best.c : "");
  }, [p, campaign]);

  const chosen = (claim && claims.includes(claim as ClaimCode) ? claim : claims[0]) as ClaimCode | undefined;
  const check = useMemo(() => (p && campaign && chosen ? preview(p, campaign, chosen) : null), [p, campaign, chosen]);
  const prior = chosen && campaign && p ? challenges.filter((s) => s.campaign_id === campaign.id && s.barcode === p.code && s.claim === chosen) : [];
  const blocked = prior.some((s) => s.state === "pending" || s.ruling === "UPHELD");

  const go = (value: string) => {
    const b = barcodeFrom(value);
    setInput(value);
    setCode(b);
  };

  return (
    <div className="brand-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-[28px] leading-none">Check a label</h2>
          <p className="text-sm text-muted-foreground mt-1.5">Paste a barcode or an Open Food Facts link. We run the contract&apos;s checks; the photo checks are left to the validators.</p>
        </div>
        <span className="label-tag whitespace-nowrap">no wallet needed</span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(input);
        }}
      >
        <input className="field h-10 mono text-[13px]" placeholder="8412170028579 or world.openfoodfacts.org/product/…" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" className="h-10" disabled={!barcodeFrom(input)}>
          <ScanBarcode className="h-4 w-4" />
          Check
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Try:{" "}
        {SAMPLES.map((s, i) => (
          <span key={s.code}>
            {i > 0 && " · "}
            <button type="button" className="underline decoration-dotted hover:text-foreground" onClick={() => go(s.code)}>
              {s.label}
            </button>
          </span>
        ))}
      </p>

      {product.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading Open Food Facts…
        </p>
      )}
      {product.isError && <p className="text-sm text-destructive">Open Food Facts could not be read right now: {product.error.message}</p>}
      {code && product.isSuccess && !p && <p className="text-sm text-destructive">Open Food Facts has no product with barcode {code}.</p>}

      {p && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-[auto_1fr] gap-4">
            <div className="flex gap-1.5">
              {[p.front, p.nutrition, p.ingredientsPhoto].filter(Boolean).slice(0, 2).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="print h-28 w-20 object-cover" />
              ))}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="label-tag">barcode {p.code}</p>
              <a href={productUrl(p.code)} target="_blank" rel="noreferrer" className="display text-xl leading-tight hover:underline block">
                {p.name || "Unnamed product"}
              </a>
              <p className="text-sm text-muted-foreground">
                {[p.brands, p.quantity, p.liquid ? "liquid: per 100 ml" : "per 100 g"].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Sold in {p.countries.slice(0, 4).map(countryName).join(", ") || "unknown"} · record rev {p.rev}, edited {p.lastModified || "?"}
              </p>
            </div>
          </div>

          <div className="panel px-3 py-2">
            <p className="display text-lg leading-none">Nutrition on record</p>
            <div className="rule-heavy mt-1.5" />
            <dl className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 pt-1.5 text-sm">
              {NUTRIENTS.map(([k, label]) => (
                <div key={k}>
                  <dt className="label-tag">{label}</dt>
                  <dd className="mono font-semibold">{p.nutriments[k] !== undefined ? `${Number(p.nutriments[k])}${k.startsWith("energy") ? "" : " g"}` : "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          {!campaign ? (
            <p className="text-sm text-muted-foreground">No campaign is open right now; open one to start paying for checks.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                {open.length > 1 && (
                  <label className="space-y-1">
                    <span className="label-tag block">campaign</span>
                    <select className="field h-9 w-auto pr-7" value={campaign.id} onChange={(e) => setCampaignId(e.target.value)}>
                      {open.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.id})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="space-y-1">
                  <span className="label-tag block">claim to check</span>
                  <select className="field h-9 w-auto pr-7" value={chosen} onChange={(e) => setClaim(e.target.value as ClaimCode)}>
                    {claims.map((c) => (
                      <option key={c} value={c}>
                        {CLAIMS[c].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {check && chosen && (
                <>
                  <ul className="space-y-1.5">
                    {check.steps.map((s) => (
                      <li key={s.label} className="flex items-start gap-2 text-sm">
                        <StepIcon state={s.state} />
                        <span>
                          <span className="font-medium">{s.label}</span>
                          <span className="text-muted-foreground"> · {s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="rule-thin" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm">
                      {check.verdict === "candidate" && <span className="stamp stamp-upheld">worth a challenge</span>}
                      {check.verdict === "qualifies" && <span className="stamp stamp-rejected">record qualifies</span>}
                      {check.verdict === "wait" && <span className="stamp stamp-unclear">likely undecided</span>}
                      {check.verdict === "out" && <span className="stamp stamp-unclear">outside this campaign</span>}
                      <span className="text-muted-foreground ml-2 text-xs">
                        upheld pays the stake back + <span className="tape">{formatGen(campaign.reward, 4)} GEN</span>
                      </span>
                    </p>
                    <Button
                      size="sm"
                      disabled={!isConnected || !!pending || blocked || isFunder(campaign, address) || wei(campaign.pot) < wei(campaign.reward)}
                      onClick={() => writeAsync({ kind: "challenge", campaignId: campaign.id, barcode: p.code, claim: chosen }).catch(() => {})}
                    >
                      {pending === `challenge:${campaign.id}` && <Loader2 className="h-4 w-4 animate-spin" />}
                      Challenge for {formatGen(campaign.stake, 4)} GEN stake
                    </Button>
                  </div>
                  {blocked && <p className="text-xs text-muted-foreground">Already {prior.some((s) => s.ruling === "UPHELD") ? "upheld" : "being read"} in this campaign: see {prior.at(-1)?.id}.</p>}
                  {!isConnected && <p className="text-xs text-muted-foreground">Connect MetaMask to challenge; checking needs no wallet.</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
