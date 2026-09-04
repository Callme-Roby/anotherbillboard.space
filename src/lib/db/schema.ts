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
 * Buildings — the central building plus every building that unlocks once
 * the cumulative amount paid across the site crosses one of its
 * thresholds (`unlockedAtAmount`). Rows are seeded once (see
 * `src/lib/db/seed.ts`) from `src/lib/economy.ts`'s threshold ladder,
 * not created on the fly as thresholds are crossed — "unlocked" is a
 * property computed at read time (threshold <= current total), not
 * stored.
 */
export const buildings = pgTable("buildings", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Building typology (e.g. "central", "tower", "kiosk", ...). Kept as
  // free text — see `panels.category` below for why.
  type: text("type").notNull(),

  // Resolved: the central building's top 1-4 ranking is *computed* from
  // `panels.amount` at read time (whichever panels currently have the
  // highest amounts), not stored here — so `rank` is unused for now.
  // Brief: "rank (nullable — 1 à 4 pour le bâtiment central)"; kept as a
  // column in case a future design wants to pin specific structures to
  // specific ranks instead of a fully dynamic leaderboard.
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
 *
 * A row also passes through a *pending* state between payment and the
 * buyer submitting their URL (per brief: the URL is collected only after
 * Stripe confirms payment, not in the initial checkout modal). Pending
 * rows have `url`, `positionX`/`positionY`/`size` all null and are
 * excluded from any public listing by filtering on `positionX IS NOT
 * NULL` — placement only runs once the panel is finalized in the claim
 * step, so a null position doubles as the "not finalized yet" flag
 * without a separate status column.
 */
export const panels = pgTable(
  "panels",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Cumulative amount paid for this panel, in cents (Stripe's smallest
    // currency unit) so totals stay exact — never store this as a float.
    amount: integer("amount").notNull().default(0),

    // Null while pending (payment confirmed, URL not submitted yet).
    url: text("url"),

    // Metadata scraped from `url` right after the buyer submits it.
    title: text("title"),
    faviconUrl: text("favicon_url"),
    dominantColor: text("dominant_color"),
    description: text("description"),

    // Free-form on purpose (see brief: "extensible") — validated at the
    // application layer instead of a DB enum so new categories don't need
    // a migration.
    category: text("category"),

    // Placement algorithm output (world-space coordinates + size). Null
    // until the panel is finalized — see the pending-state note above.
    positionX: real("position_x"),
    positionY: real("position_y"),
    size: real("size"),

    buildingId: uuid("building_id").references(() => buildings.id),
    slotIndex: integer("slot_index"),

    ownerEmail: text("owner_email"),
    notifyOnOutgrown: boolean("notify_on_outgrown").notNull().default(false),

    // Correlates a pending panel back to the Stripe Checkout session that
    // created it, so the post-payment "submit your URL" page (which only
    // has `?session_id=...` from Stripe's `{CHECKOUT_SESSION_ID}`
    // placeholder to go on) can find its row. Not used for boosts — a
    // boost updates an existing, already-claimed panel directly.
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),

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

/**
 * One row per processed Stripe webhook event (`event.id`, e.g.
 * `evt_...`), purely for idempotency. Stripe explicitly documents that
 * the same event can be delivered more than once; the webhook handler
 * inserts here before doing anything else and treats a unique-constraint
 * failure as "already processed, return 200 and stop" rather than
 * re-applying a payment.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Panel = typeof panels.$inferSelect;
export type NewPanel = typeof panels.$inferInsert;
