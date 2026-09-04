import { and, desc, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

import { db } from "../client";
import { type NewPanel, type Panel, panels, stripeEvents } from "../schema";
import { isUniqueViolation } from "./stripeEvents";

/**
 * A panel counts as "finalized" (visible in the scene, eligible for
 * ranking/placement) once it has a position — see the pending-state note
 * on `panels.positionX` in schema.ts.
 */
const finalized = isNotNull(panels.positionX);
const groundOnly = isNull(panels.buildingId);

/**
 * Creates the pending panel row for a confirmed `new_panel` checkout,
 * atomically with recording the webhook event as processed (see
 * queries/stripeEvents.ts) — `db.batch` sends both statements in one
 * round trip, so they can't land only one of them. Returns `null` if
 * `eventId` was already processed (duplicate webhook delivery), which
 * the webhook handler should treat as a no-op success, not an error.
 */
export async function createPendingPanelIdempotent(
  eventId: string,
  data: {
    amountCents: number;
    category: string | null;
    ownerEmail: string | null;
    notifyOnOutgrown: boolean;
    stripeCheckoutSessionId: string;
  },
): Promise<Panel | null> {
  try {
    const [, inserted] = await db.batch([
      db.insert(stripeEvents).values({ id: eventId }),
      db
        .insert(panels)
        .values({
          amount: data.amountCents,
          category: data.category,
          ownerEmail: data.ownerEmail,
          notifyOnOutgrown: data.notifyOnOutgrown,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId,
        } satisfies Partial<NewPanel>)
        .returning(),
    ]);
    return inserted[0];
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Looks up a panel by the Stripe Checkout session that created it —
 * regardless of whether it's still pending or already finalized, so the
 * claim route can tell "not ready yet" (no row) apart from "already
 * claimed" (row, but `positionX` set) and treat the latter as an
 * idempotent success rather than an error.
 */
export async function findPanelBySessionId(sessionId: string): Promise<Panel | undefined> {
  const [panel] = await db.select().from(panels).where(eq(panels.stripeCheckoutSessionId, sessionId)).limit(1);
  return panel;
}

/**
 * Finalizes a pending panel with its claimed URL, scraped metadata, and
 * placement. Conditioned on the panel still being pending
 * (`positionX IS NULL`) so a duplicate/double-submitted claim request is
 * a harmless no-op (returns `undefined`) instead of re-placing or
 * re-scraping over an already-finalized panel.
 */
export async function finalizePanel(
  id: string,
  data: {
    url: string;
    title: string | null;
    description: string | null;
    faviconUrl: string | null;
    dominantColor: string;
    positionX: number;
    positionY: number;
    size: number;
  },
): Promise<Panel | undefined> {
  const [panel] = await db
    .update(panels)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(panels.id, id), isNull(panels.positionX)))
    .returning();
  return panel;
}

/** Finalized ground panels' placement data, for the placement algorithm's collision check. */
export async function getGroundPanelsForPlacement(): Promise<
  Array<{ positionX: number; positionY: number; size: number }>
> {
  const rows = await db
    .select({ positionX: panels.positionX, positionY: panels.positionY, size: panels.size })
    .from(panels)
    .where(and(finalized, groundOnly));

  // positionX/positionY/size are only null pre-finalization, excluded by
  // `finalized` above — safe to assert non-null for the caller's sake.
  return rows.map((row) => ({
    positionX: row.positionX ?? 0,
    positionY: row.positionY ?? 0,
    size: row.size ?? 0,
  }));
}

export async function getPanelById(id: string): Promise<Panel | undefined> {
  const [panel] = await db.select().from(panels).where(eq(panels.id, id)).limit(1);
  return panel;
}

export interface ListPanelsOptions {
  category?: string;
  /** Crude stand-in for the real LOD budget until viewport/zoom filtering lands — see README. */
  limit?: number;
}

export async function listPanels(options: ListPanelsOptions = {}): Promise<Panel[]> {
  const conditions = [finalized, groundOnly];
  if (options.category && options.category !== "all") {
    conditions.push(eq(panels.category, options.category));
  }

  return db
    .select()
    .from(panels)
    .where(and(...conditions))
    .orderBy(desc(panels.amount))
    .limit(options.limit ?? 200);
}

/** Top N panels by amount, across ground panels and building screens alike — feeds the central building's ranking display. */
export async function getTopPanelsByAmount(count: number): Promise<Panel[]> {
  return db.select().from(panels).where(finalized).orderBy(desc(panels.amount)).limit(count);
}

export async function getTotalAmountCents(): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${panels.amount}), 0)` })
    .from(panels)
    .where(finalized);
  return Number(row?.total ?? 0);
}

/**
 * Applies a confirmed boost atomically with recording the webhook event
 * as processed — same `db.batch` rationale as
 * `createPendingPanelIdempotent`. Returns `null` if `eventId` was
 * already processed.
 */
export async function boostPanelIdempotent(
  eventId: string,
  panelId: string,
  additionalAmountCents: number,
  newSize: number,
): Promise<Panel | null> {
  try {
    const [, updated] = await db.batch([
      db.insert(stripeEvents).values({ id: eventId }),
      db
        .update(panels)
        .set({
          amount: sql`${panels.amount} + ${additionalAmountCents}`,
          size: newSize,
          updatedAt: new Date(),
        })
        .where(eq(panels.id, panelId))
        .returning(),
    ]);
    return updated[0] ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Panels opted into outgrown notifications that a change (new panel or
 * boost) just overtook: they were at or above `previousAmount` (the
 * changing panel's amount before this change) but are now below
 * `newAmount` — i.e. the changing panel just passed them.
 */
export async function getPanelsOutgrownByChange(params: {
  excludePanelId: string;
  previousAmount: number;
  newAmount: number;
}): Promise<Panel[]> {
  return db
    .select()
    .from(panels)
    .where(
      and(
        finalized,
        eq(panels.notifyOnOutgrown, true),
        isNotNull(panels.ownerEmail),
        ne(panels.id, params.excludePanelId),
        gte(panels.amount, params.previousAmount),
        lt(panels.amount, params.newAmount),
      ),
    );
}
