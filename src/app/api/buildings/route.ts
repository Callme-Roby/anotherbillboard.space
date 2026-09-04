import { NextResponse } from "next/server";

/**
 * GET /api/buildings
 *
 * Returns the state of every building: which are unlocked, and the
 * central building's current top 1-4 ranking. Implemented as part of the
 * payment-flow step.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — coming with the payment flow." },
    { status: 501 },
  );
}
