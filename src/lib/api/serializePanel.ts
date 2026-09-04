import type { Panel } from "../db/schema";

/**
 * The subset of a `panels` row that's safe to send to any client —
 * everywhere a panel goes out over the wire (GET /api/panels, realtime
 * broadcasts) must go through this, never the raw DB row. In
 * particular, `ownerEmail` (PII) and `stripeCheckoutSessionId` (an
 * internal correlation id) never leave the server.
 */
export interface PublicPanel {
  id: string;
  amount: number;
  url: string;
  title: string | null;
  faviconUrl: string | null;
  dominantColor: string | null;
  description: string | null;
  category: string | null;
  positionX: number;
  positionY: number;
  size: number;
  buildingId: string | null;
  slotIndex: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Only call this with a finalized panel (non-null position/size/url) — see schema.ts's pending-state note. */
export function serializePanel(panel: Panel): PublicPanel {
  return {
    id: panel.id,
    amount: panel.amount,
    url: panel.url ?? "",
    title: panel.title,
    faviconUrl: panel.faviconUrl,
    dominantColor: panel.dominantColor,
    description: panel.description,
    category: panel.category,
    positionX: panel.positionX ?? 0,
    positionY: panel.positionY ?? 0,
    size: panel.size ?? 0,
    buildingId: panel.buildingId,
    slotIndex: panel.slotIndex,
    createdAt: panel.createdAt.toISOString(),
    updatedAt: panel.updatedAt.toISOString(),
  };
}
