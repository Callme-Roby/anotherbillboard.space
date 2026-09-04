import { NextResponse } from "next/server";

/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout session for the buyer's chosen (pay-what-you-
 * want) amount. Implemented as part of the payment-flow step.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — coming with the Stripe checkout flow." },
    { status: 501 },
  );
}
