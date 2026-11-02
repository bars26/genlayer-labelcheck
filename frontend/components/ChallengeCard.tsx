"use client";

import { Loader2 } from "lucide-react";
import {
  CODE_LABEL,
  OUTCOME_TEXT,
  RULING_STYLE,
  claimLabel,
  evidenceOf,
  factsOf,
  formatGen,
  isFunder,
  productUrl,
  sameAddress,
  short,
  timelineOf,
  wei,
  windowLeftSeconds,
  type Answer,
  type Campaign,
  type Challenge,
} from "@/lib/contracts/types";
import { useLabelCheckWrite } from "@/lib/hooks/useLabelCheck";
import { useNow } from "@/lib/hooks/useNow";
import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "./ui/button";

const ANSWER_CLS: Record<Answer, string> = { MEETS: "text-[#157A4A]", FAILS: "text-[#C8202A]", UNCLEAR: "text-[#9A6E00]" };

export function ChallengeCard({ s, campaign }: { s: Challenge; campaign: Campaign }) {
  const now = useNow(5_000);
  const { address, isConnected } = useWallet();
  const { writeAsync, pending } = useLabelCheckWrite();
  const facts = factsOf(s);
  const packets = evidenceOf(s);
  const timeline = timelineOf(s);
  const style = RULING_STYLE[s.ruling] ?? RULING_STYLE.UNCLEAR;
  const left = windowLeftSeconds(s, now);
  const funder = isFunder(campaign, address);
  const mine = sameAddress(s.challenger, address);
  const canContest = isConnected && s.state === "pending" && left > 0 && (s.ruling === "UPHELD" ? funder && !s.funders_contested : mine && !s.challenger_contested);
  const canSettle = isConnected && s.state === "pending" && (left === 0 || (s.ruling === "UPHELD" ? funder : mine));
  const busy = (k: string) => pending === `${k}:${s.id}`;
  const lastPhotos = [...packets].reverse().find((p) => p.photos?.length)?.photos ?? [];
  const front = lastPhotos.find((p) => p.kind === "front");
  const n = facts.nutriments ?? {};

  return (
    <article className="panel p-3 sm:p-4 flex gap-3 sm:gap-4">
      <a href={productUrl(s.barcode)} target="_blank" rel="noreferrer" className="block w-20 sm:w-24 shrink-0 self-start">
        {front ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={front.url} alt={facts.product_name || "front of the pack"} className="print aspect-[3/4] w-full object-cover" loading="lazy" />
        ) : (
          <div className="print aspect-[3/4] w-full bg-[#EDE9DD] flex items-end p-1">
            <div className="barcode h-6 w-full opacity-70" />
          </div>
        )}
        <p className="mt-1 mono text-[10px] text-muted-foreground truncate">{s.barcode}</p>
      </a>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`stamp ${style.stamp}`}>{style.label}</span>
          <span className="text-xs text-muted-foreground">{CODE_LABEL[s.code] ?? s.code}</span>
          <span className="label-tag ml-auto">{s.id}</span>
        </div>
        <p className="text-sm leading-snug">
          <a className="font-semibold underline decoration-dotted" href={productUrl(s.barcode)} target="_blank" rel="noreferrer">
            {facts.product_name || `Product ${s.barcode}`}
          </a>
          {facts.brands && <span className="text-muted-foreground"> · {facts.brands}</span>} ·{" "}
          <span className="font-medium">&ldquo;{claimLabel(s.claim)}&rdquo;</span>
        </p>
        <p className="text-sm text-muted-foreground leading-snug">{s.why}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {s.ruling === "UPHELD" && wei(s.reward) > 0n && (
            <span className="tape text-[11px]">
              {formatGen(s.reward, 4)} GEN {s.outcome === "paid" ? "paid" : "reserved"}
            </span>
          )}
          {s.outcome && <span className="font-medium">{OUTCOME_TEXT[s.outcome] ?? s.outcome}</span>}
          <span className="text-muted-foreground">by {short(s.challenger)} · stake {formatGen(s.stake, 4)} GEN</span>
          {s.state === "pending" && (
            <span className="text-muted-foreground">
              {left > 0 ? `window ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : "window closed: anyone can settle"}
            </span>
          )}
        </div>

        {(canContest || canSettle) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {canSettle && (
              <Button size="sm" disabled={!!pending} onClick={() => writeAsync({ kind: "settle", challengeId: s.id }).catch(() => {})}>
                {busy("settle") && <Loader2 className="h-4 w-4 animate-spin" />}
                {left > 0 ? (s.ruling === "UPHELD" ? "Pay now" : "Accept the ruling") : "Settle"}
              </Button>
            )}
            {canContest && (
              <Button size="sm" variant="outline" disabled={!!pending} onClick={() => writeAsync({ kind: "contest", challengeId: s.id }).catch(() => {})}>
                {busy("contest") && <Loader2 className="h-4 w-4 animate-spin" />}
                Ask for a fresh reading
              </Button>
            )}
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What the validators read</summary>
          <div className="mt-2 space-y-3">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
              <Fact k="Rule" v={facts.rule || "—"} />
              <Fact k="Basis" v={facts.liquid ? "per 100 ml (liquid)" : "per 100 g"} />
              <Fact k="Record" v={facts.rev ? `rev ${facts.rev}, edited ${facts.last_modified}` : "—"} />
              <Fact k="On the front" v={facts.front_answer ? (facts.front_answer === "MEETS" ? "claim printed" : facts.front_answer === "FAILS" ? "claim not printed" : "unclear") : "—"} />
              <Fact k="Record check" v={facts.data_detail ? `${facts.data_answer} · ${facts.data_detail}` : facts.data_answer || "—"} />
              <Fact k={`Photo of the ${facts.label_photo_kind || "label"}`} v={facts.photo_answer || "—"} />
              {Object.keys(n).length > 0 && (
                <Fact
                  k="Nutrients on record"
                  v={Object.entries(n)
                    .map(([k, v]) => `${k.replace("_100g", "").replace("energy-kcal", "kcal")} ${v}`)
                    .join(" · ")}
                />
              )}
              {facts.countries && <Fact k="Sold in" v={facts.countries.join(", ") || "—"} />}
            </dl>
            {facts.ingredients && <p className="text-muted-foreground"><span className="label-tag">ingredients on record</span> {facts.ingredients}</p>}
            {lastPhotos.length > 0 && (
              <div>
                <p className="label-tag mb-1">photos the validators looked at</p>
                <div className="flex flex-wrap gap-3">
                  {lastPhotos.map((p) => (
                    <a key={p.sha256 + p.kind} href={p.url.replace(/\.\d+\.jpg$/, ".full.jpg")} target="_blank" rel="noreferrer" className="block w-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.kind} className="print aspect-square w-full object-cover" loading="lazy" />
                      <span className="mt-1 block text-[10px] text-muted-foreground">{p.kind}</span>
                      <span className={`block text-[11px] font-bold ${ANSWER_CLS[p.answer]}`}>{p.answer}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="label-tag mb-1">evidence packets (one per reading, stored on-chain)</p>
              {packets.map((p, i) => (
                <p key={p.packet_sha256 ?? i} className="mono text-[11px] text-muted-foreground break-all">
                  #{i + 1} {p.read_at} UTC · {p.ruling} · packet {p.packet_sha256?.slice(0, 16)}… · facts {p.facts_sha256?.slice(0, 12)}…
                  {p.photos?.map((ph) => (
                    <span key={ph.sha256 + ph.kind}>
                      {" "}
                      · {ph.kind} {ph.sha256.slice(0, 10)}…
                    </span>
                  ))}{" "}
                  ·{" "}
                  <a className="underline" href={p.record} target="_blank" rel="noreferrer">
                    record
                  </a>
                </p>
              ))}
            </div>
            <ol className="space-y-0.5">
              {timeline.map((t, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="mono">{t.at.slice(5, 16).replace("T", " ")}</span> {t.event}
                  {t.ruling && <> → {t.ruling}</>}
                  {t.by && <> by {t.by}</>}
                  {t.outcome && <> · {OUTCOME_TEXT[t.outcome] ?? t.outcome}</>}
                  {t.reward && wei(t.reward) > 0n && <> · reward {formatGen(t.reward, 4)} GEN</>}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </div>
    </article>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate" title={v}>
        {v}
      </dd>
    </div>
  );
}
