/**
 * Tunable "game design" numbers for the pay-what-you-want economy:
 * purchase bounds, the amount -> size curve, and the building unlock
 * ladder. The brief gives these as examples ("ex. 50€, 200€...", "30 à
 * 50 bâtiments"), not an exact spec — kept in one file so they're easy
 * to retune without hunting through the payment/placement/building code
 * that consumes them.
 *
 * All amounts are in cents (Stripe's smallest currency unit).
 */

// --- Purchases ------------------------------------------------------------
// Comfortably above Stripe's own EUR minimum charge (50 cents) to avoid
// trivial/spam purchases; no upper bound — it's pay-what-you-want, kept
// sane visually by the logarithmic size curve below rather than a cap.
export const MIN_PURCHASE_AMOUNT_CENTS = 200; // 2€
export const CURRENCY = "eur";

// --- Amount -> panel size ---------------------------------------------------
// Logarithmic, not linear or capped: growth keeps going for very large
// payments (no artificial ceiling to hit), but with diminishing returns
// so a single huge payment doesn't dwarf everything else on screen.
// Reduced twice now (1.0/0.55, then 0.5/0.28, then this) — panels kept
// reading as too large next to the buildings behind them rather than as
// small billboards at their feet. This also sharpens the incentive the
// building screens are meant to carry: a top-ranked spot on a building
// only means something if ground panels are modest by comparison (see
// placeholders/sizing.ts for the mock-scene version of this same curve,
// kept separately but scaled the same way).
// Raised again alongside the move to 16:9: a panel now has to carry a
// readable title *and* a two-line description (see createPanel.ts), and
// the previous size only ever had room for a short code.
const SIZE_MIN = 0.46;
const SIZE_SCALE = 0.24;
const SIZE_NORMALIZER_CENTS = 2000; // ~20€ reference point

export function sizeFromAmountCents(amountCents: number): number {
  const amount = Math.max(0, amountCents);
  return SIZE_MIN + SIZE_SCALE * Math.log2(1 + amount / SIZE_NORMALIZER_CENTS);
}

/**
 * 16:9, shared by the panel geometry *and* its texture canvas (see
 * createPanel.ts) — a texture drawn at a different ratio than the plane
 * it lands on stretches every glyph on it.
 */
export const PANEL_ASPECT_RATIO = 16 / 9;

export function panelDimensionsFromAmountCents(amountCents: number): {
  width: number;
  height: number;
} {
  const height = sizeFromAmountCents(amountCents);
  return { width: height * PANEL_ASPECT_RATIO, height };
}

// --- Building unlock ladder -------------------------------------------------
// Power-law rather than geometric growth: geometric thresholds blow up
// unreasonably fast over 40 buildings (millions of euros by building
// #20), a power curve keeps the top of the ladder plausible while still
// making later buildings meaningfully harder to unlock.
const BUILDING_UNLOCK_BASE_CENTS = 5000; // 50€, matches the brief's example
const BUILDING_UNLOCK_EXPONENT = 1.5;
export const MAX_ADDITIONAL_BUILDINGS = 40; // + 1 central = 41, within "30 à 50"

/** Cumulative site-wide amount (cents) required to unlock the nth additional building (1-indexed). */
export function buildingUnlockThresholdCents(n: number): number {
  return Math.round(BUILDING_UNLOCK_BASE_CENTS * Math.pow(n, BUILDING_UNLOCK_EXPONENT));
}
