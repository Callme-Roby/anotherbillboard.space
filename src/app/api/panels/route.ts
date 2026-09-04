import { NextResponse } from "next/server";

/**
 * GET /api/panels?category=&viewport=&zoom=
 *
 * Returns the panels to display for the given category filter, visible
 * viewport, and zoom level (continuous LOD budget — see brief), sorted
 * by amount. The 3D scene currently renders local placeholder data
 * (src/three/placeholders/mockPanels.ts) instead of calling this.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — coming with the payment flow." },
    { status: 501 },
  );
}
