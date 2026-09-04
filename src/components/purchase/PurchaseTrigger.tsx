"use client";

import { useState } from "react";

import { PurchaseModal } from "./PurchaseModal";

/**
 * Persistent CTA + the modal it opens — self-contained so page.tsx
 * doesn't need its own state for this.
 *
 * Raised well clear of the bottom edge by default (bottom-36) rather
 * than tucked right against it (bottom-4, restored from `sm:` up): on
 * a narrow phone the Minimap/Legend/this button would otherwise all
 * compete for the same slim bottom-4 row. Verified empirically (not
 * just by hand-computed offsets) against both the Legend and Minimap's
 * actual rendered bounds at 320-414px widths — see mobile-check script.
 * Re-check this clearance whenever Legend's mobile (`essential`) entry
 * count changes — its height, not this button's, is what drives it.
 *
 * `whitespace-nowrap` matters here specifically: a `fixed` element with
 * `left-1/2` and no `right` gets its auto-width via shrink-to-fit
 * against the space from that 50% mark to the viewport's right edge
 * (half the viewport), *before* `-translate-x-1/2` re-centers it — so
 * without `nowrap` this label wraps to two lines on any phone narrower
 * than ~415px, silently doubling the button's height and eating into
 * the clearance below.
 */
export function PurchaseTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(9rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/30 bg-black/50 px-5 py-2.5 font-mono text-sm text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:bottom-[calc(1rem+var(--safe-bottom))]"
      >
        Réserver un panneau
      </button>
      {open ? <PurchaseModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
