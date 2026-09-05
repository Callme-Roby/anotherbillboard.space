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
 * The five ranked screens on the skyline — one per tower, rank 1 on the
 * tallest. Content only: each one's *size and shape* comes from the
 * screen rig it's mounted in (see SKYLINE in createCentralBuilding.ts),
 * because a corner wrap's two halves and a stack's ticker strip are
 * dimensions of the mount, not of the panel.
 *
 * Deliberately huge in those rigs — routinely wider than the tower
 * carrying them — and the exact opposite of ground panels
 * (placeholders/sizing.ts, lib/economy.ts), which stay small: a top-five
 * rank is meant to read as a real reward, a spectacular you can spot
 * from across the plaza, not a screen competing with the building for
 * attention.
 */
export const RANK_SLOT_PLACEHOLDERS: PlaceholderPanel[] = [
  { id: "rank-1", amount: 0, color: "#f4d35e", label: "1" },
  { id: "rank-2", amount: 0, color: "#9aa7b0", label: "2" },
  { id: "rank-3", amount: 0, color: "#c98a4b", label: "3" },
  { id: "rank-4", amount: 0, color: "#78909c", label: "4" },
  { id: "rank-5", amount: 0, color: "#6b8f71", label: "5" },
];

/**
 * The rotating summit's screens, on the mast above the tallest tower.
 * Three of the four carry site-wide announcements; the fourth is rank
 * 1's bonus screen, in *addition* to the corner wrap it already owns on
 * the shaft below — the visible privilege of the top spot, seen from
 * every angle as the rotor turns.
 *
 * Order matters: index 0 is the rank-1 slot (see ROTOR_RANK_SLOT in
 * createCentralBuilding.ts), the rest are announcements.
 */
export const ANNOUNCEMENT_PLACEHOLDERS: PlaceholderPanel[] = [
  { id: "rotor-rank-1", amount: 0, color: "#f4d35e", label: "1" },
  { id: "rotor-annonce-1", amount: 0, color: "#3f88c5", label: "INFO" },
  { id: "rotor-annonce-2", amount: 0, color: "#e94f37", label: "LIVE" },
  { id: "rotor-annonce-3", amount: 0, color: "#44bba4", label: "NEWS" },
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
  size: { width: 1.1, height: 0.52 },
};
