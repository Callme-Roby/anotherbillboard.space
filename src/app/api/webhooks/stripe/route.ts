import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { serializePanel } from "@/lib/api/serializePanel";
import { isKnownCategory } from "@/lib/categories";
import {
  boostPanelIdempotent,
  createPendingPanelIdempotent,
  getPanelById,
  getPanelsOutgrownByChange,
} from "@/lib/db/queries/panels";
import { sizeFromAmountCents } from "@/lib/economy";
import { broadcastToPlaza } from "@/lib/pusher/server";
import { PanelEvent } from "@/lib/realtime";
import { sendOutgrownNotification } from "@/lib/resend";
import { getStripe } from "@/lib/stripe/client";

/**
 * POST /api/webhooks/stripe
 *
 * Confirms the Stripe payment and applies its effect:
 * - `new_panel` checkout -> creates the *pending* panel row (no URL/
 *   position yet — see schema.ts). The scene doesn't show it and
 *   nothing is broadcast until the buyer claims it with a URL
 *   (POST /api/panels/claim), which does the scraping + placement +
 *   broadcast the brief describes.
 * - `boost` checkout -> grows an existing panel immediately (no claim
 *   step needed, it already has a URL) and broadcasts the update.
 *
 * Every event is recorded (atomically with its effect, via `db.batch` —
 * see queries/panels.ts) so a re-delivered event — Stripe explicitly
 * documents this can happen — is a safe no-op instead of double-applying
 * a payment.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("[webhook] missing stripe-signature header or STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[webhook] signature verification failed", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amountCents = session.amount_total;
  if (amountCents === null || amountCents === undefined) {
    console.error("[webhook] session has no amount_total", session.id);
    return NextResponse.json({ received: true });
  }

  try {
    switch (session.metadata?.type) {
      case "new_panel":
        await handleNewPanel(event.id, session, amountCents);
        break;
      case "boost":
        await handleBoost(event.id, session, amountCents);
        break;
      default:
        console.warn("[webhook] unrecognized session metadata.type", session.id, session.metadata?.type);
    }
  } catch (error) {
    // Non-2xx tells Stripe to retry — appropriate for a transient DB/
    // network failure, but note idempotency means a *successful* retry
    // after a failure here is exactly what we want (nothing was
    // partially applied, see db.batch usage in the query layer).
    console.error("[webhook] failed to process event", event.id, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleNewPanel(eventId: string, session: Stripe.Checkout.Session, amountCents: number) {
  const rawCategory = session.metadata?.category ?? "";
  const category = isKnownCategory(rawCategory) ? rawCategory : null;
  const ownerEmail = session.metadata?.ownerEmail || null;
  const notifyOnOutgrown = session.metadata?.notifyOnOutgrown === "true";

  const panel = await createPendingPanelIdempotent(eventId, {
    amountCents,
    category,
    ownerEmail,
    notifyOnOutgrown,
    stripeCheckoutSessionId: session.id,
  });

  if (!panel) {
    console.log("[webhook] event already processed, skipping (new_panel)", eventId);
  }
}

async function handleBoost(eventId: string, session: Stripe.Checkout.Session, additionalAmountCents: number) {
  const panelId = session.metadata?.panelId;
  if (!panelId) {
    console.error("[webhook] boost session is missing panelId metadata", session.id);
    return;
  }

  const existing = await getPanelById(panelId);
  if (!existing || existing.positionX === null) {
    console.error("[webhook] boost target panel not found or not finalized", panelId);
    return;
  }

  const previousAmount = existing.amount;
  const newAmount = previousAmount + additionalAmountCents;
  const newSize = sizeFromAmountCents(newAmount);

  const updated = await boostPanelIdempotent(eventId, panelId, additionalAmountCents, newSize);
  if (!updated) {
    console.log("[webhook] event already processed, skipping (boost)", eventId);
    return;
  }

  await broadcastToPlaza(PanelEvent.Updated, serializePanel(updated));

  const outgrown = await getPanelsOutgrownByChange({
    excludePanelId: panelId,
    previousAmount,
    newAmount,
  });
  await Promise.all(
    outgrown.map((panel) =>
      sendOutgrownNotification({
        // getPanelsOutgrownByChange only returns rows with ownerEmail set.
        to: panel.ownerEmail as string,
        panelUrl: panel.url ?? panel.id,
        outgrownByAmountCents: newAmount,
      }),
    ),
  );
}
