import { NextResponse } from "next/server";

import { serializePanel } from "@/lib/api/serializePanel";
import { listBuildingsWithUnlockState } from "@/lib/db/queries/buildings";
import { getTopPanelsByAmount, getTotalAmountCents } from "@/lib/db/queries/panels";

// One ranked screen per tower on the skyline (see SKYLINE in
// createCentralBuilding.ts) — rank 1 additionally gets a bonus slot on
// the rotating summit, but that reuses the same panel rather than
// needing a sixth row here.
const CENTRAL_RANKING_SIZE = 5;

/**
 * GET /api/buildings
 *
 * Every seeded building (see src/lib/db/seed.ts) with its unlocked
 * state, plus the central building's current top 1-5 ranking. The
 * ranking is computed live from `panels.amount` rather than stored —
 * see the doc comment on the `buildings` table in schema.ts.
 */
export async function GET() {
  const totalAmountCents = await getTotalAmountCents();
  const [buildings, centralRanking] = await Promise.all([
    listBuildingsWithUnlockState(totalAmountCents),
    getTopPanelsByAmount(CENTRAL_RANKING_SIZE),
  ]);

  return NextResponse.json({
    totalAmountCents,
    buildings,
    centralRanking: centralRanking.map(serializePanel),
  });
}
