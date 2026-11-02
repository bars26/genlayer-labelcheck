"use client";

import { Plus } from "lucide-react";
import { AccountPanel } from "./AccountPanel";
import { BrandMark } from "./BrandMark";
import { FaucetButton } from "./FaucetButton";
import { Button } from "./ui/button";

export function Navbar({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b-[1.5px] border-[#121212] bg-[#F6F3EA]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="display text-[26px] leading-none">LabelCheck</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <FaucetButton />
          <Button size="sm" onClick={onCreate}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Open a campaign</span>
          </Button>
          <AccountPanel />
        </div>
      </div>
    </header>
  );
}
