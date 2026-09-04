import { NextResponse } from "next/server";

import { serializePanel } from "@/lib/api/serializePanel";
import { listBuildingsWithUnlockState } from "@/lib/db/queries/buildings";
import { getTopPanelsByAmount, getTotalAmountCents } from "@/lib/db/queries/panels";

const CENTRAL_RANKING_SIZE = 4;

/**
 * GET /api/buildings
 *
 * Every seeded building (see src/lib/db/seed.ts) with its unlocked
 * state, plus the central building's current top 1-4 ranking. The
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
