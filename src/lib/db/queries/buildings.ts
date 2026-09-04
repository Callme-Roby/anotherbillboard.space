import { asc } from "drizzle-orm";

import { db } from "../client";
import { type Building, buildings } from "../schema";

export interface BuildingState extends Building {
  unlocked: boolean;
}

/**
 * Every seeded building (see src/lib/db/seed.ts), with `unlocked`
 * computed against the current cumulative total rather than stored —
 * see the schema.ts doc comment on `buildings` for why.
 */
export async function listBuildingsWithUnlockState(totalAmountCents: number): Promise<BuildingState[]> {
  const rows = await db.select().from(buildings).orderBy(asc(buildings.unlockedAtAmount));

  return rows.map((building) => ({
    ...building,
    unlocked: building.unlockedAtAmount === null || building.unlockedAtAmount <= totalAmountCents,
  }));
}
