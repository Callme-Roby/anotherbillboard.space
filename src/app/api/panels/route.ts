import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { serializePanel } from "@/lib/api/serializePanel";
import { isKnownCategory } from "@/lib/categories";
import { listPanels } from "@/lib/db/queries/panels";

// Deliberately modest at zoom=0: the whole point is that the default,
// fully-zoomed-out view shows only the top few panels (so the buildings
// — the actual reward for a high rank — read clearly, not crowded out by
// a big wall of ground panels) and loading the rest is something zooming
// in *does*, both as a reveal and as the perf optimization the brief
// asks for (fewer meshes to build/texture until the visitor asks for them).
const BASE_LIMIT = 20;
const MAX_LIMIT = 200;

/**
 * GET /api/panels?category=&viewport=&zoom=
 *
 * Returns finalized ground panels (building screens aren't listed here
 * — see /api/buildings), ranked by amount, optionally filtered by
 * category.
 *
 * `zoom` (0 = fully zoomed out, 1 = fully zoomed in, matching
 * CameraController.normalizedZoom) scales how many panels come back —
 * more the further in. That's a stand-in for the brief's real LOD
 * budget: a *continuous* function of zoom applied *within the visible
 * viewport*, not a global top-N. `viewport` is accepted but not yet used
 * to spatially filter results — both need the 3D scene's actual
 * viewport/frustum math on the client side, which is the next piece of
 * work here (see README). The client side of the zoom half already
 * exists (LivePanels re-fetches as zoom crosses meaningful thresholds,
 * debounced) — this route only had to actually honor the parameter.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const categoryParam = searchParams.get("category");
  const category =
    categoryParam && categoryParam !== "all" && isKnownCategory(categoryParam) ? categoryParam : undefined;

  const zoomParam = Number(searchParams.get("zoom"));
  const zoom = Number.isFinite(zoomParam) ? Math.min(Math.max(zoomParam, 0), 1) : 0;
  // Zoomed in (1) sees more panels than the default zoomed-out overview (0).
  const limit = Math.round(BASE_LIMIT + zoom * (MAX_LIMIT - BASE_LIMIT));

  const panels = await listPanels({ category, limit });

  return NextResponse.json({ panels: panels.map(serializePanel) });
}
