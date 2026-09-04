import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { serializePanel } from "@/lib/api/serializePanel";
import { isKnownCategory } from "@/lib/categories";
import { listPanels } from "@/lib/db/queries/panels";

const BASE_LIMIT = 60;
const MAX_LIMIT = 200;

/**
 * GET /api/panels?category=&viewport=&zoom=
 *
 * Returns finalized ground panels (building screens aren't listed here
 * — see /api/buildings), ranked by amount, optionally filtered by
 * category.
 *
 * `zoom` (0 = fully zoomed out, 1 = fully zoomed in, matching
 * CameraController.normalizedZoom) crudely scales how many panels come
 * back — more at a wide view. That's a stand-in for the brief's real
 * LOD budget: a *continuous* function of zoom applied *within the
 * visible viewport*, not a global top-N. `viewport` is accepted but not
 * yet used to spatially filter results — both need the 3D scene's
 * actual viewport/frustum math on the client side, which is the next
 * piece of work here (see README).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const categoryParam = searchParams.get("category");
  const category =
    categoryParam && categoryParam !== "all" && isKnownCategory(categoryParam) ? categoryParam : undefined;

  const zoomParam = Number(searchParams.get("zoom"));
  const zoom = Number.isFinite(zoomParam) ? Math.min(Math.max(zoomParam, 0), 1) : 0;
  // Zoomed out (0) sees more of the plaza at once than zoomed in (1).
  const limit = Math.round(MAX_LIMIT - zoom * (MAX_LIMIT - BASE_LIMIT));

  const panels = await listPanels({ category, limit });

  return NextResponse.json({ panels: panels.map(serializePanel) });
}
