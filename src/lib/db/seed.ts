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
import { loadEnvConfig } from "@next/env";

import { buildingUnlockThresholdCents, MAX_ADDITIONAL_BUILDINGS } from "../economy";

// Run through `tsx`, not through Next, so nothing has loaded `.env.local`
// for us — see drizzle.config.ts for the same reason.
//
// It has to happen before `./client` is even *imported*, not merely
// before the first query: that module reads DATABASE_URL once at load
// and hands it to `neon()` there and then. A plain top-level import
// would be evaluated before this line whatever the order on the page —
// imports are hoisted — so the client is pulled in dynamically below,
// after the env exists. Without this the seed silently ran against the
// placeholder connection string and failed on a perfectly good one.
loadEnvConfig(process.cwd());

const PLACEHOLDER_BUILDING_TYPES = ["tower", "kiosk", "billboard-wall", "arch"] as const;

async function seed() {
  const [{ db }, { buildings }] = await Promise.all([import("./client"), import("./schema")]);

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
