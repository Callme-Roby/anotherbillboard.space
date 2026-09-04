"use client";

import { useState } from "react";

import { PurchaseModal } from "./PurchaseModal";

/** Persistent CTA + the modal it opens — self-contained so page.tsx doesn't need its own state for this. */
export function PurchaseTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/30 bg-black/50 px-5 py-2 font-mono text-sm text-white backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        Réserver un panneau
      </button>
      {open ? <PurchaseModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
