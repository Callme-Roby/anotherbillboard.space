import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * POST /api/panels/:id/boost
 *
 * Accepts an additional payment on an existing panel to grow it after
 * being outgrown by others. Implemented as part of the payment-flow step.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/panels/[id]/boost">) {
  const { id } = await ctx.params;
  return NextResponse.json(
    { error: "Not implemented yet — coming with the payment flow.", id },
    { status: 501 },
  );
}
