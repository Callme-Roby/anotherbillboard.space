import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { PANEL_CATEGORIES } from "@/lib/categories";
import { MIN_PURCHASE_AMOUNT_CENTS } from "@/lib/economy";
import { createNewPanelCheckoutSession } from "@/lib/stripe/checkout";

const CheckoutRequestSchema = z
  .object({
    amountCents: z.number().int().min(MIN_PURCHASE_AMOUNT_CENTS),
    category: z.enum(PANEL_CATEGORIES).optional(),
    ownerEmail: z.email().optional(),
    notifyOnOutgrown: z.boolean().optional().default(false),
  })
  .refine((data) => !data.notifyOnOutgrown || Boolean(data.ownerEmail), {
    message: "notifyOnOutgrown requires ownerEmail",
    path: ["ownerEmail"],
  });

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for a brand new ground panel at the
 * buyer's chosen (pay-what-you-want) amount. Per brief, the site URL
 * isn't collected here: it's asked for after payment confirms (see
 * /panneau/nouveau + /api/panels/claim). Boosting an existing panel is
 * a separate flow — see /api/panels/:id/boost.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = CheckoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { url } = await createNewPanelCheckoutSession({
      amountCents: parsed.data.amountCents,
      origin: request.nextUrl.origin,
      category: parsed.data.category,
      ownerEmail: parsed.data.ownerEmail,
      notifyOnOutgrown: parsed.data.notifyOnOutgrown,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[checkout] failed to create Stripe session", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 502 });
  }
}
