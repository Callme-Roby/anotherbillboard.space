/**
 * Placeholder panel data for the static first render.
 *
 * None of this is persisted or fetched — it stands in for rows the real
 * `panels` table (src/lib/db/schema.ts) will hold once the payment flow
 * is wired up. Kept isolated here so swapping in `GET /api/panels` later
 * is a matter of replacing where this array comes from, not how it's
 * consumed by the scene.
 */
export interface PlaceholderPanel {
  id: string;
  /** Cumulative amount paid, in cents — mirrors `panels.amount`. */
  amount: number;
  color: string;
  label: string;
  /** Explicit override for panels whose size isn't amount-derived. */
  size?: { width: number; height: number };
}

export const MOCK_PANELS: PlaceholderPanel[] = [
  { id: "mock-agence-1", amount: 14000, color: "#e94f37", label: "AG" },
  { id: "mock-design-1", amount: 9800, color: "#3f88c5", label: "DS" },
  { id: "mock-marketing-1", amount: 7600, color: "#44bba4", label: "MK" },
  { id: "mock-agence-2", amount: 6200, color: "#f2a541", label: "AG" },
  { id: "mock-design-2", amount: 4900, color: "#8562b3", label: "DS" },
  { id: "mock-marketing-2", amount: 3400, color: "#e85d75", label: "MK" },
  { id: "mock-agence-3", amount: 2200, color: "#5c6f7a", label: "AG" },
  { id: "mock-design-3", amount: 1500, color: "#2ec4b6", label: "DS" },
];

/**
 * The central building's top 1-4 ranking screens — the rotating summit
 * assembly on the tallest tower (see createCentralBuilding.ts).
 * Deliberately huge — wider than most of the cluster's own towers (the
 * tallest is 2.4 wide, see TOWERS in createCentralBuilding.ts) — on
 * purpose, the opposite of ground panels (placeholders/sizing.ts,
 * lib/economy.ts), which stay small: a top rank on the building is
 * meant to read as a real reward, a big showcase billboard like a real
 * rooftop spectacular, not a screen that has to compete with the
 * building for attention.
 */
export const RANK_SLOT_PLACEHOLDERS: PlaceholderPanel[] = [
  { id: "rank-1", amount: 0, color: "#f4d35e", label: "1", size: { width: 3.2, height: 2.4 } },
  { id: "rank-2", amount: 0, color: "#cfd8dc", label: "2", size: { width: 2.8, height: 2.1 } },
  { id: "rank-3", amount: 0, color: "#c98a4b", label: "3", size: { width: 2.4, height: 1.8 } },
  { id: "rank-4", amount: 0, color: "#78909c", label: "4", size: { width: 2.0, height: 1.5 } },
];

/**
 * Decorative facade screens dotted across the central building's other
 * towers — not tied to any real ranking or purchase, just set dressing
 * so the cluster reads as a lived-in skyline (per a user-provided
 * reference) rather than bare boxes. Big enough to be a real feature of
 * each facade (like the rotating summit above, in contrast to small
 * ground panels) but kept within their own tower's width — unlike the
 * summit screens, these are flush-mounted on a specific wall, so
 * overhanging it would look like a placement bug rather than a real
 * spectacular. See createCentralBuilding.ts for which tower each one
 * sits on.
 */
export const FACADE_DECOR_PLACEHOLDERS: PlaceholderPanel[] = [
  { id: "facade-decor-1", amount: 0, color: "#6b8f71", label: "＋", size: { width: 1.3, height: 1.0 } },
  { id: "facade-decor-2", amount: 0, color: "#b5651d", label: "%", size: { width: 1.1, height: 0.85 } },
  { id: "facade-decor-3", amount: 0, color: "#4a6fa5", label: "◆", size: { width: 1.2, height: 0.9 } },
  { id: "facade-decor-4", amount: 0, color: "#9a5b8f", label: "★", size: { width: 1.4, height: 1.05 } },
];

/**
 * The fixed "Built by Roby" signature panel: outside the placement
 * algorithm, non-purchasable, permanent. See SceneManager for its
 * (hardcoded, off to the side) position.
 */
export const SIGNATURE_PANEL: PlaceholderPanel = {
  id: "signature-built-by-roby",
  amount: 0,
  color: "#3a3d47",
  // Short on purpose: a full "Built by Roby" sentence doesn't survive
  // the deliberately low internal render resolution (see PostProcessing)
  // at this panel's small, off-to-the-side size — confirmed by actually
  // looking at the render, not assumed. A terse signature mark reads
  // better here anyway.
  label: "ROBY",
  size: { width: 1.5, height: 0.7 },
};
