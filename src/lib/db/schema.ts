import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Buildings — the central ranking structure plus every building that
 * unlocks once the cumulative amount paid across the site crosses one of
 * its thresholds (`unlockedAtAmount`).
 */
export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Building typology (e.g. "central", "tower", "kiosk", ...). Kept as
  // free text — see `panels.category` below for why.
  type: text("type").notNull(),

  // 1-4 for the central building's ranking slots (the display for the
  // top 1-4 cumulative payments); null for every other building. See
  // brief: "rank (nullable — 1 à 4 pour le bâtiment central)". Whether
  // that maps to one central-building row with 4 screens, or up to 4
  // ranked rows, is intentionally left open here and should be settled
  // when the ranking query is implemented.
  rank: integer("rank"),

  // Cumulative total (in cents) that had to be reached for this building
  // to unlock. Null for the central building, which always exists.
  unlockedAtAmount: integer("unlocked_at_amount"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Panels — a single unified table for both ground-level billboards and
 * building screens. A row is a building screen when `buildingId` is set
 * (with `slotIndex` giving its position on that building); otherwise it's
 * a free-standing ground panel placed by the placement algorithm.
 */
export const panels = pgTable(
  "panels",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Cumulative amount paid for this panel, in cents (Stripe's smallest
    // currency unit) so totals stay exact — never store this as a float.
    amount: integer("amount").notNull().default(0),

    url: text("url").notNull(),

    // Metadata scraped from `url` right after purchase.
    title: text("title"),
    faviconUrl: text("favicon_url"),
    dominantColor: text("dominant_color"),
    description: text("description"),

    // Free-form on purpose (see brief: "extensible") — validated at the
    // application layer instead of a DB enum so new categories don't need
    // a migration.
    category: text("category"),

    // Placement algorithm output (world-space coordinates + size).
    positionX: real("position_x"),
    positionY: real("position_y"),
    size: real("size"),

    buildingId: uuid("building_id").references(() => buildings.id),
    slotIndex: integer("slot_index"),

    ownerEmail: text("owner_email"),
    notifyOnOutgrown: boolean("notify_on_outgrown").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("panels_amount_idx").on(table.amount),
    index("panels_category_idx").on(table.category),
    index("panels_building_id_idx").on(table.buildingId),
  ],
);

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Panel = typeof panels.$inferSelect;
export type NewPanel = typeof panels.$inferInsert;
