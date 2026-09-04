const MIN_AMOUNT = 1000; // 10€ in cents — placeholder floor for this mock set
const MAX_AMOUNT = 15000; // 150€ in cents — placeholder ceiling for this mock set
const MIN_SIZE = 1.1;
const MAX_SIZE = 2.6;

/**
 * Placeholder amount -> size mapping for the static mock scene. The real
 * placement/sizing algorithm (part of the payment-flow work, filling
 * `panels.size`) will replace this — isolated here so swapping it later
 * is a one-file change.
 */
export function sizeFromAmount(amountCents: number): { width: number; height: number } {
  const t = clamp((amountCents - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT), 0, 1);
  const height = MIN_SIZE + t * (MAX_SIZE - MIN_SIZE);
  return { width: height * 1.35, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
