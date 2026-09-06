import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { serializePanel } from "@/lib/api/serializePanel";
import { PANEL_CATEGORIES } from "@/lib/categories";
import { finalizePanel, findPanelBySessionId, getGroundPanelsForPlacement } from "@/lib/db/queries/panels";
import { sizeFromAmountCents } from "@/lib/economy";
import { findGroundPlacement } from "@/lib/placement";
import { broadcastToPlaza } from "@/lib/pusher/server";
import { PanelEvent } from "@/lib/realtime";
import { scrapeSite } from "@/lib/scrape";

const ClaimRequestSchema = z.object({
  sessionId: z.string().min(1),
  url: z.url(),
  // Constrained to the known list even though the column is free text
  // (see lib/categories.ts): the column stays open so adding a category
  // never needs a migration, but what the funnel writes into it should
  // still be one of the values the filter UI can offer back.
  category: z.enum(PANEL_CATEGORIES),
});

/**
 * POST /api/panels/claim
 *
 * Not one of the brief's 5 listed routes, but required by the flow it
 * describes: the buyer's URL is collected *after* Stripe confirms
 * payment (step 3 in "Achat d'un panneau"), which needs somewhere to
 * land. `/panneau/nouveau` (Stripe's success_url, carrying
 * `?session_id={CHECKOUT_SESSION_ID}`) posts here with that session id
 * and the submitted URL; this is where the brief's steps 4-6 happen:
 * scrape the URL, place + finalize the panel, broadcast it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = ClaimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, url, category } = parsed.data;

  const panel = await waitForPanel(sessionId);
  if (!panel) {
    return NextResponse.json(
      {
        error:
          "Aucun panneau en attente pour cette session — le paiement est peut-être encore en cours de confirmation, ou le lien est invalide.",
      },
      { status: 404 },
    );
  }

  // Already claimed (page refresh / double submit) — idempotent no-op.
  if (panel.positionX !== null) {
    return NextResponse.json({ panel: serializePanel(panel) });
  }

  const scraped = await scrapeSite(url);
  const size = sizeFromAmountCents(panel.amount);
  const existingGroundPanels = await getGroundPanelsForPlacement();
  const { positionX, positionY } = findGroundPlacement(existingGroundPanels, size);

  const finalized = await finalizePanel(panel.id, {
    url,
    title: scraped.title,
    description: scraped.description,
    faviconUrl: scraped.faviconUrl,
    dominantColor: scraped.dominantColor,
    category,
    positionX,
    positionY,
    size,
  });

  if (!finalized) {
    // Lost a race with a concurrent claim of the same session (e.g. a
    // double-click) — someone else's request finalized it first;
    // return that instead of erroring.
    const current = await findPanelBySessionId(sessionId);
    if (current) return NextResponse.json({ panel: serializePanel(current) });
    return NextResponse.json({ error: "Failed to finalize panel" }, { status: 500 });
  }

  await broadcastToPlaza(PanelEvent.Created, serializePanel(finalized));

  return NextResponse.json({ panel: serializePanel(finalized) });
}

/**
 * The webhook that creates the pending panel can arrive slightly after
 * the buyer's browser is redirected here. A short retry loop covers
 * that gap without pushing retry logic onto the client — Stripe
 * webhooks almost always land well within this window.
 */
async function waitForPanel(sessionId: string) {
  const attempts = 5;
  const delayMs = 800;
  for (let i = 0; i < attempts; i++) {
    const panel = await findPanelBySessionId(sessionId);
    if (panel) return panel;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return undefined;
}
