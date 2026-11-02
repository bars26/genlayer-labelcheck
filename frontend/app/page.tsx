"use client";

import { useState } from "react";
import { Camera, Coins, Loader2, RefreshCw, ScanBarcode, Scale } from "lucide-react";
import { CampaignCard } from "@/components/CampaignCard";
import { CreateCampaignModal } from "@/components/CreateCampaignModal";
import { LabelChecker } from "@/components/LabelChecker";
import { Navbar } from "@/components/Navbar";
import { TransactionPanel } from "@/components/TransactionPanel";
import { Button } from "@/components/ui/button";
import { formatGen, wei } from "@/lib/contracts/types";
import { useRegistry } from "@/lib/hooks/useLabelCheck";

const STEPS = [
  { icon: ScanBarcode, title: "Spot a claim", body: "A pack says “sugar-free”, “high protein” or “low salt”. Anyone challenges it by barcode, with a small stake." },
  { icon: Camera, title: "Validators look", body: "Each validator looks at the front photo: is that claim really printed? “-25% salt” is not “low salt”." },
  { icon: Scale, title: "Record and label agree", body: "The Open Food Facts record is checked against EU law in code, and the photo of the printed label must say the same." },
  { icon: Coins, title: "Misleading pays", body: "Both fail: the challenger gets the stake back plus the reward. They disagree: nothing is decided and the stake goes back." },
];

export default function HomePage() {
  const { campaigns, challenges, isLoading, isError, error, isFetching, refetch, fetchedAt } = useRegistry();
  const [creating, setCreating] = useState(false);
  const ordered = [...campaigns].sort((a, b) => Number(b.id.split("_")[1]) - Number(a.id.split("_")[1]));
  const inPots = campaigns.filter((c) => c.state === "open").reduce((t, c) => t + wei(c.pot) + wei(c.reserved), 0n);
  const upheld = challenges.filter((s) => s.ruling === "UPHELD").length;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onCreate={() => setCreating(true)} />
      <main className="flex-grow pt-24 pb-12 px-4 md:px-6">
        <div className="max-w-6xl mx-auto space-y-10">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-4 lg:pt-2">
              <p className="label-tag">nutrition claims · EU regulation 1924/2006 · open food facts</p>
              <h1 className="display text-[56px] md:text-[76px] leading-[0.86]">
                Is the claim
                <br />
                on the pack
                <br />
                <span className="tape px-2">true?</span>
              </h1>
              <div className="rule-heavy" />
              <p className="text-lg text-muted-foreground">
                “Sugar-free”, “high protein”, “low salt” each have a legal threshold. LabelCheck lets anyone challenge a claim by barcode. GenLayer validators look at
                the photos of the pack, check the numbers against the law, and pay the challenger when the claim does not hold.
              </p>
              <dl className="grid grid-cols-3 gap-0 panel">
                <div className="p-3 border-r-[1.5px] border-[#121212]">
                  <dt className="label-tag">GEN in pots</dt>
                  <dd className="display text-3xl">{formatGen(inPots, 2)}</dd>
                </div>
                <div className="p-3 border-r-[1.5px] border-[#121212]">
                  <dt className="label-tag">challenges</dt>
                  <dd className="display text-3xl">{challenges.length}</dd>
                </div>
                <div className="p-3">
                  <dt className="label-tag">misleading</dt>
                  <dd className="display text-3xl text-[#C8202A]">{upheld}</dd>
                </div>
              </dl>
            </div>
            <div className="lg:col-span-7">
              <LabelChecker campaigns={campaigns} challenges={challenges} />
            </div>
          </section>

          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-0 panel">
            {STEPS.map((s, i) => (
              <div key={s.title} className={`p-4 ${i < 3 ? "lg:border-r-[1.5px] border-[#121212]" : ""} ${i % 2 === 0 ? "sm:border-r-[1.5px] lg:border-r-[1.5px]" : ""} ${i < 2 ? "border-b-[1.5px] lg:border-b-0" : ""}`}>
                <p className="flex items-center gap-2">
                  <span className="mono text-xs font-bold">0{i + 1}</span>
                  <s.icon className="h-4 w-4" />
                  <strong className="display text-xl leading-none">{s.title}</strong>
                </p>
                <p className="text-sm text-muted-foreground mt-2">{s.body}</p>
              </div>
            ))}
          </section>
          <p className="text-xs text-muted-foreground -mt-6">
            Checking needs no wallet. To fund or challenge, connect MetaMask and press Test GEN for free GenLayer Studio tokens. The campaigns below are demo
            campaigns funded by test wallets; the products, records and photos are real, read live from Open Food Facts.
          </p>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-5">
              <div className="flex items-end justify-between gap-3">
                <h2 className="display text-4xl">Campaigns</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {fetchedAt && <span>updated {new Date(fetchedAt).toLocaleTimeString()}</span>}
                  <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
                    <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              {isLoading && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading the campaigns from GenLayer Studio…
                </p>
              )}
              {isError && <p className="text-destructive text-sm">Could not read the contract: {error?.message}</p>}
              {!isLoading && ordered.length === 0 && (
                <div className="brand-card p-6 text-center space-y-3">
                  <p className="text-muted-foreground">No campaigns yet.</p>
                  <Button onClick={() => setCreating(true)}>Open the first campaign</Button>
                </div>
              )}
              {ordered.map((c) => (
                <CampaignCard key={c.id} campaign={c} challenges={challenges} />
              ))}
            </div>
            <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-24">
              <div className="brand-card p-5 space-y-3 text-sm">
                <h3 className="display text-2xl leading-none">How a challenge is ruled</h3>
                <div className="rule-heavy" />
                <p>
                  <strong>On the pack?</strong> Validators look at the front photo for the claim, in any language. A comparative claim (“-25% salt”) is not the
                  absolute one (“low salt”); a claim that is not printed is rejected.
                </p>
                <div className="rule-thin" />
                <p>
                  <strong>Against the law, in code.</strong> The record&apos;s nutrients per 100 g (or 100 ml for drinks) are compared with the EU thresholds. For
                  “no added sugars”, validators read the ingredient list.
                </p>
                <div className="rule-thin" />
                <p>
                  <strong>The printed label must agree.</strong> Open Food Facts is edited by volunteers, so validators also read the photo of the nutrition table or
                  ingredient list. A typo in the record never convicts a product: when they disagree, nothing is decided.
                </p>
                <div className="rule-thin" />
                <p>
                  <strong>Ten minutes to answer.</strong> Funders can ask once for a fresh reading of a misleading ruling; the challenger once for any other. Records
                  edited in the last 3 days are not read.
                </p>
              </div>
              <TransactionPanel />
            </aside>
          </section>
        </div>
      </main>
      <footer className="border-t-[1.5px] border-[#121212] py-6 px-4 text-center text-xs text-muted-foreground space-y-1">
        <p>
          LabelCheck on GenLayer Studio · product records and photos from{" "}
          <a className="underline" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
            Open Food Facts
          </a>{" "}
          (ODbL / CC BY-SA). Rulings are about a product&apos;s record and photos, not legal advice.
        </p>
        <p>
          <a className="underline" href="https://github.com/bars26/genlayer-labelcheck" target="_blank" rel="noreferrer">
            Source and reproduction on GitHub
          </a>
        </p>
      </footer>
      <CreateCampaignModal open={creating} onOpenChange={setCreating} />
    </div>
  );
}
