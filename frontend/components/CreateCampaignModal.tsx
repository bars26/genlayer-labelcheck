"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { CLAIMS, CLAIM_CODES, MIN_WEI, PRESETS, addDays, formatGen, parseGen, todayUtc, type ClaimCode } from "@/lib/contracts/types";
import { useLabelCheckWrite } from "@/lib/hooks/useLabelCheck";
import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const realDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Open a campaign: choose the claims and countries, the reward and the stake, and fund the pot. */
export function CreateCampaignModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { isConnected } = useWallet();
  const { writeAsync, pending } = useLabelCheckWrite();
  const [claims, setClaims] = useState<ClaimCode[]>(PRESETS[0].claims);
  const [f, setF] = useState({ title: PRESETS[0].label, countries: "", ends: addDays(todayUtc(), 60), reward: "0.5", stake: "0.1", fund: "3", perChallenger: "5" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const reward = parseGen(f.reward);
  const stake = parseGen(f.stake);
  const fund = parseGen(f.fund);
  const countries = f.countries.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  const problems = [
    !(f.title.trim().length >= 3 && f.title.trim().length <= 80) && "The title must be 3 to 80 characters.",
    claims.length === 0 && "Choose at least one claim.",
    countries.some((c) => !/^[a-z]{2}:[a-z0-9-]{2,40}$/.test(c)) && "Countries are Open Food Facts tags like en:france, separated by commas.",
    !(realDay(f.ends) && f.ends >= todayUtc()) && "The last day must be a real date, today or later.",
    !(reward && reward >= MIN_WEI) && "The reward must be at least 0.1 GEN.",
    !(stake && stake >= MIN_WEI) && "The stake must be at least 0.1 GEN.",
    !(fund && reward && fund >= reward) && "Fund the campaign with at least one reward.",
    !(/^\d{1,3}$/.test(f.perChallenger) && Number(f.perChallenger) >= 1 && Number(f.perChallenger) <= 100) && "Per challenger must be 1 to 100.",
  ].filter(Boolean) as string[];
  const rewards = reward && fund && reward > 0n ? Number(fund / reward) : 0;

  const submit = async () => {
    if (!reward || !stake || !fund) return;
    try {
      await writeAsync({
        kind: "create",
        input: { title: f.title.trim(), claims, countries, ends: f.ends, reward, stake, perChallenger: Number(f.perChallenger) },
        fund,
      });
      onOpenChange(false);
    } catch {
      // shown in the toast and the transactions panel
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="display text-3xl">Open a campaign</DialogTitle>
          <DialogDescription>
            Pay shoppers to catch misleading nutrition claims. Anyone challenges a product&apos;s claim with a stake; validators look at the front of the pack,
            check the Open Food Facts record against EU Regulation 1924/2006 and read the printed label. A misleading claim pays the reward from this pot.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              title={p.why}
              className="rounded-sm border-[1.5px] border-[#121212] bg-white px-3 py-1 text-xs font-semibold hover:bg-[#FFE14D]"
              onClick={() => {
                setClaims(p.claims);
                setF({ ...f, title: p.label, countries: p.countries });
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={f.title} onChange={set("title")} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Claims this campaign pays for</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {CLAIM_CODES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm" title={CLAIMS[c].printed}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#121212]"
                    checked={claims.includes(c)}
                    onChange={(e) => setClaims(e.target.checked ? [...claims, c] : claims.filter((x) => x !== c))}
                  />
                  {CLAIMS[c].label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Countries (optional)</Label>
              <Input value={f.countries} onChange={set("countries")} placeholder="en:france, en:spain" />
              <p className="text-[11px] text-muted-foreground">Open Food Facts country tags; empty means products sold anywhere.</p>
            </div>
            <div className="space-y-1">
              <Label>Last day to challenge</Label>
              <Input type="date" value={f.ends} onChange={set("ends")} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Reward (GEN)</Label>
              <Input value={f.reward} onChange={set("reward")} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>Stake (GEN)</Label>
              <Input value={f.stake} onChange={set("stake")} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>Per challenger</Label>
              <Input value={f.perChallenger} onChange={set("perChallenger")} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Fund now (GEN)</Label>
              <Input value={f.fund} onChange={set("fund")} inputMode="decimal" />
            </div>
          </div>
          <p className="text-sm panel p-3">
            Pays up to <strong>{rewards}</strong> misleading claim{rewards === 1 ? "" : "s"} of {reward ? formatGen(reward, 4) : "?"} GEN. Rejected challenges
            add their stake to the pot. After <strong>{f.ends || "?"}</strong>, once no challenge is open, anyone closes the campaign and every funder gets their share
            of what is left.
          </p>
          {problems.length > 0 && (
            <ul className="text-sm text-destructive list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <Button className="w-full" onClick={submit} disabled={!isConnected || problems.length > 0 || pending === "create"}>
            {pending === "create" && <Loader2 className="h-4 w-4 animate-spin" />}
            {isConnected ? `Fund ${fund ? formatGen(fund, 4) : "?"} GEN and open the campaign` : "Connect a wallet to open a campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
