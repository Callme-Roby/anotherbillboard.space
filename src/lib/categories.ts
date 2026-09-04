/**
 * Known panel categories. Kept as an app-level list rather than a DB enum
 * — `panels.category` stays free text (see schema.ts) so a new category
 * never needs a migration; this list only drives the filter UI / default
 * selection when purchasing.
 */
export const PANEL_CATEGORIES = [
  "agence",
  "design",
  "marketing",
  "dev",
  "photo",
  "autre",
] as const;

export type PanelCategory = (typeof PANEL_CATEGORIES)[number];

export const DEFAULT_CATEGORY_FILTER = "all" as const;

export function isKnownCategory(value: string): value is PanelCategory {
  return (PANEL_CATEGORIES as readonly string[]).includes(value);
}
