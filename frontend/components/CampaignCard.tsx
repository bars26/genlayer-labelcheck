"use client";

import { useState } from "react";
import { CalendarDays, Globe2, Loader2, UserRound } from "lucide-react";
import {
  CLAIMS,
  barcodeFrom,
  claimsOf,
  countriesOf,
  countryName,
  formatGen,
  funderRow,
  fundersOf,
  isFunder,
  parseGen,
  rewardsLeft,
  todayUtc,
  wei,
  type Campaign,
  type Challenge,
  type ClaimCode,
} from "@/lib/contracts/types";
import { useLabelCheckWrite } from "@/lib/hooks/useLabelCheck";
import { useWallet } from "@/lib/genlayer/wallet";
import { ChallengeCard } from "./ChallengeCard";
import { Button } from "./ui/button";

export function CampaignCard({ campaign, challenges }: { campaign: Campaign; challenges: Challenge[] }) {
  const { address, isConnected } = useWallet();
  const { writeAsync, pending } = useLabelCheckWrite();
  const claims = claimsOf(campaign);
  const countries = countriesOf(campaign);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [claim, setClaim] = useState<ClaimCode>(claims[0]);
  const [fundInput, setFundInput] = useState("1");
  const funded = wei(campaign.funded_total) + wei(campaign.stakes_kept);
  const paid = wei(campaign.paid_total);
  const reserved = wei(campaign.reserved);
  const pot = wei(campaign.pot);
  const pct = (x: bigint) => (funded > 0n ? Number((x * 10000n) / funded) / 100 : 0);
  const open = campaign.state === "open";
  const takes = open && todayUtc() <= campaign.ends;
  const canClose = open && todayUtc() > campaign.ends && wei(campaign.n_pending) === 0n;
  const barcode = barcodeFrom(barcodeInput);
  const fundWei = parseGen(fundInput);
  const funders = Number(campaign.n_funders ?? 0);
  const myFunding = funderRow(campaign, address);
  const toReturn = fundersOf(campaign).filter((f) => !f.refunded);
  const mine = challenges.filter((s) => s.campaign_id === campaign.id).sort((a, b) => Number(b.id.split("_")[1]) - Number(a.id.split("_")[1]));

  return (
    <section id={campaign.id} className="brand-card overflow-hidden animate-fade-in">
      <div className="p-5 sm:p-6 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="label-tag">
              {campaign.id} · {open ? "open" : "closed"} · {funders} funder{funders === 1 ? "" : "s"}
            </p>
            <h3 className="display text-[32px] leading-[0.95]">{campaign.title}</h3>
          </div>
          <div className="text-right space-y-1">
            <p className="text-sm">
              upheld pays <span className="tape">{formatGen(campaign.reward, 4)} GEN</span>
            </p>
            <p className="text-xs text-muted-foreground">stake {formatGen(campaign.stake, 4)} GEN · {rewardsLeft(campaign)} rewards left</p>
          </div>
        </div>
        <div className="rule-heavy mt-3" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Globe2 className="h-3.5 w-3.5" /> {countries.length ? countries.map(countryName).join(", ") : "sold anywhere"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> challenges until {campaign.ends}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" /> up to {String(campaign.per_challenger)} upheld per challenger
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-3">
          {claims.map((c) => (
            <span key={c} className="rounded-sm border-[1.5px] border-[#121212] px-1.5 py-0.5 text-xs font-semibold" title={CLAIMS[c]?.printed}>
              {CLAIMS[c]?.label ?? c}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
        <div>
          <div className="flex h-3 overflow-hidden border-[1.5px] border-[#121212] bg-white" role="img" aria-label={`${formatGen(paid)} paid, ${formatGen(reserved)} reserved, ${formatGen(pot)} in the pot`}>
            <div className="bg-[#121212]" style={{ width: `${pct(paid)}%` }} />
            <div className="bg-[#FFE14D]" style={{ width: `${pct(reserved)}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>{formatGen(paid, 4)} GEN paid</span>
            <span>{formatGen(reserved, 4)} reserved</span>
            <span>{formatGen(pot, 4)} in the pot</span>
            {wei(campaign.stakes_kept) > 0n && <span>{formatGen(campaign.stakes_kept, 4)} from rejected stakes</span>}
            <span className="ml-auto">
              {String(campaign.n_upheld)} misleading · {String(campaign.n_rejected)} rejected · {String(campaign.n_unclear)} undecided
            </span>
          </div>
        </div>

        {takes && (
          <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
            <form
              className="space-y-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (barcode) writeAsync({ kind: "challenge", campaignId: campaign.id, barcode, claim }).then(() => setBarcodeInput("")).catch(() => {});
              }}
            >
              <label className="label-tag" htmlFor={`bc-${campaign.id}`}>
                challenge a claim
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id={`bc-${campaign.id}`}
                  className="field h-9 flex-1 min-w-[10rem] mono text-[13px]"
                  placeholder="barcode or Open Food Facts link"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
                <select className="field h-9 w-auto pr-7" value={claim} onChange={(e) => setClaim(e.target.value as ClaimCode)} aria-label="claim">
                  {claims.map((c) => (
                    <option key={c} value={c}>
                      {CLAIMS[c]?.label ?? c}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" className="h-9" disabled={!isConnected || !barcode || isFunder(campaign, address) || pot < wei(campaign.reward) || !!pending}>
                  {pending === `challenge:${campaign.id}` && <Loader2 className="h-4 w-4 animate-spin" />}
                  Stake {formatGen(campaign.stake, 4)} GEN
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Misleading: your stake back plus the reward. Rejected: the stake joins the pot. Undecided: the stake comes back.
              </p>
            </form>
            <form
              className="flex gap-2 items-end md:pb-[22px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (fundWei && fundWei > 0n) writeAsync({ kind: "fund", campaignId: campaign.id, value: fundWei }).catch(() => {});
              }}
            >
              <div className="space-y-1">
                <label className="label-tag" htmlFor={`fund-${campaign.id}`}>
                  add GEN
                </label>
                <input id={`fund-${campaign.id}`} className="field h-9" style={{ width: 72 }} inputMode="decimal" value={fundInput} onChange={(e) => setFundInput(e.target.value)} />
              </div>
              <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!isConnected || !fundWei || !!pending}>
                {pending === `fund:${campaign.id}` && <Loader2 className="h-4 w-4 animate-spin" />}
                Fund
              </Button>
            </form>
          </div>
        )}
        {canClose && (
          <Button size="sm" variant="outline" disabled={!isConnected || !!pending} onClick={() => writeAsync({ kind: "close", campaignId: campaign.id }).catch(() => {})}>
            Close and return the pot
          </Button>
        )}
        {!takes && open && <p className="text-xs text-muted-foreground">Challenges closed on {campaign.ends}; once none is open, anyone can close the campaign.</p>}
        {!open && (
          <div className="panel px-3 py-2.5 space-y-2 text-sm">
            <p>
              Closed. {formatGen(campaign.returned_total, 4)} of {formatGen(campaign.returnable, 4)} GEN returned to {String(campaign.n_refunded)}/{funders} funders, each
              in proportion to what they put in. Anyone can send a share, always to that funder.
            </p>
            <div className="flex flex-wrap gap-2">
              {myFunding && !myFunding.refunded && (
                <Button size="sm" className="h-8" disabled={!!pending} onClick={() => writeAsync({ kind: "refund", campaignId: campaign.id, funder: myFunding.address }).catch(() => {})}>
                  Return my share
                </Button>
              )}
              {toReturn
                .filter((f) => f !== myFunding)
                .slice(0, 6)
                .map((f) => (
                  <Button key={f.address} size="sm" variant="outline" className="h-8 mono text-xs" disabled={!isConnected || !!pending}
                    onClick={() => writeAsync({ kind: "refund", campaignId: campaign.id, funder: f.address }).catch(() => {})}>
                    Return {f.address.slice(0, 6)}…{f.address.slice(-4)}
                  </Button>
                ))}
            </div>
          </div>
        )}

        {mine.length > 0 && (
          <div className="space-y-2">
            <p className="label-tag">
              challenges · {mine.length} filed · {String(campaign.n_upheld)} paid
            </p>
            <div className="space-y-2">
              {mine.map((s) => (
                <ChallengeCard key={s.id} s={s} campaign={campaign} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
