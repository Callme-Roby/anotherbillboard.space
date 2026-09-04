/**
 * One-time seed for the `buildings` table: the central building plus
 * `MAX_ADDITIONAL_BUILDINGS` more, each with an unlock threshold from
 * `src/lib/economy.ts`'s ladder. Run once against a fresh database
 * (`npm run db:seed`) after `db:push`/migrations — safe to re-run, it
 * skips seeding if any building already exists rather than duplicating
 * rows.
 *
 * Building "type" cycles through a small placeholder typology list —
 * provisional until the final building assets/design land (see brief:
 * assets are produced separately, placeholders in the meantime). The
 * count and thresholds are equally provisional product-design numbers;
 * see economy.ts for the actual tuning knobs.
 */
import { db } from "./client";
import { buildings } from "./schema";
import { buildingUnlockThresholdCents, MAX_ADDITIONAL_BUILDINGS } from "../economy";

const PLACEHOLDER_BUILDING_TYPES = ["tower", "kiosk", "billboard-wall", "arch"] as const;

async function seed() {
  const existing = await db.select({ id: buildings.id }).from(buildings).limit(1);
  if (existing.length > 0) {
    console.log("[seed] buildings table already has rows — skipping.");
    return;
  }

  const rows = [
    { type: "central", rank: null, unlockedAtAmount: null },
    ...Array.from({ length: MAX_ADDITIONAL_BUILDINGS }, (_, i) => {
      const n = i + 1;
      return {
        type: PLACEHOLDER_BUILDING_TYPES[i % PLACEHOLDER_BUILDING_TYPES.length],
        rank: null,
        unlockedAtAmount: buildingUnlockThresholdCents(n),
      };
    }),
  ];

  await db.insert(buildings).values(rows);
  console.log(`[seed] inserted ${rows.length} buildings (1 central + ${MAX_ADDITIONAL_BUILDINGS}).`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] failed:", error);
    process.exit(1);
  });
