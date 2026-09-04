import { getPanelById } from "../db/queries/panels";
import { CURRENCY } from "../economy";
import { getStripe } from "./client";

interface CreateCheckoutSessionResult {
  url: string;
}

/** Shared Stripe Checkout session creation used by both /api/checkout and /api/panels/:id/boost. */
async function createCheckoutSession(params: {
  amountCents: number;
  productName: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          unit_amount: params.amountCents,
          product_data: { name: params.productName },
        },
        quantity: 1,
      },
    ],
    metadata: params.metadata,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { url: session.url };
}

/** New ground panel: URL is collected later (see /panneau/nouveau), so success_url carries the session id for the claim step. */
export async function createNewPanelCheckoutSession(params: {
  amountCents: number;
  origin: string;
  category?: string;
  ownerEmail?: string;
  notifyOnOutgrown: boolean;
}): Promise<CreateCheckoutSessionResult> {
  return createCheckoutSession({
    amountCents: params.amountCents,
    productName: "Panneau publicitaire — Another Billboard",
    metadata: {
      type: "new_panel",
      category: params.category ?? "",
      ownerEmail: params.ownerEmail ?? "",
      notifyOnOutgrown: String(params.notifyOnOutgrown),
    },
    successUrl: `${params.origin}/panneau/nouveau?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${params.origin}/?checkout=cancelled`,
  });
}

/** Grow an existing, already-claimed panel — no claim step needed, the webhook applies the boost directly. */
export async function createBoostCheckoutSession(params: {
  panelId: string;
  amountCents: number;
  origin: string;
}): Promise<CreateCheckoutSessionResult | { error: string; status: number }> {
  const panel = await getPanelById(params.panelId);
  if (!panel || panel.positionX === null) {
    return { error: "Panel not found", status: 404 };
  }

  const result = await createCheckoutSession({
    amountCents: params.amountCents,
    productName: `Agrandir le panneau — ${panel.title ?? panel.url ?? params.panelId}`,
    metadata: { type: "boost", panelId: params.panelId },
    successUrl: `${params.origin}/?boosted=${params.panelId}`,
    cancelUrl: `${params.origin}/?checkout=cancelled`,
  });
  return result;
}
