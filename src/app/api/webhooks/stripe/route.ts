import { NextResponse } from "next/server";

/**
 * POST /api/webhooks/stripe
 *
 * Confirms the Stripe payment, scrapes the buyer's site metadata
 * (title/description/favicon/dominant color), creates or updates the
 * corresponding `panels` row, recomputes its size, and broadcasts the
 * change over Pusher/Ably. Implemented as part of the payment-flow step.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — coming with the Stripe checkout flow." },
    { status: 501 },
  );
}
