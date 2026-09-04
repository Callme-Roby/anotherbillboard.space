import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { MIN_PURCHASE_AMOUNT_CENTS } from "@/lib/economy";
import { createBoostCheckoutSession } from "@/lib/stripe/checkout";

const BoostRequestSchema = z.object({
  amountCents: z.number().int().min(MIN_PURCHASE_AMOUNT_CENTS),
});

/**
 * POST /api/panels/:id/boost
 *
 * Creates a Stripe Checkout session for an additional payment that
 * grows an existing panel. The actual amount/size increase is applied
 * by the webhook once payment confirms (POST /api/webhooks/stripe) —
 * this route only starts the checkout.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/panels/[id]/boost">) {
  const { id } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = BoostRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createBoostCheckoutSession({
    panelId: id,
    amountCents: parsed.data.amountCents,
    origin: request.nextUrl.origin,
  }).catch((error) => {
    console.error("[boost] failed to create Stripe session", error);
    return { error: "Failed to create checkout session", status: 502 as const };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
