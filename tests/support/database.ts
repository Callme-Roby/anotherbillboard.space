import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { __setDatabaseForTests } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export interface TestDatabase {
  /** Drops the test database and puts the app back on the real client. */
  close: () => Promise<void>;
  /** Empties every table, so each test starts from nothing. */
  reset: () => Promise<void>;
}

/**
 * An embedded Postgres for the whole app to run against, offline.
 *
 * The site talks to Neon over HTTP, which a test run with no network
 * cannot reach — so the payment chain (webhook, idempotency, placement)
 * had never been executed anywhere. PGlite is a real Postgres compiled
 * to WASM, so the schema, the constraints and the error codes the code
 * branches on are the genuine article rather than a mock's idea of them.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = await PGlite.create();
  const database = drizzle(client, { schema });

  await applyMigrations(client);
  // Cast because the two drivers' types differ in ways nothing here
  // uses (`$withAuth`, the `$client` type). What matters is the query
  // surface the app actually calls, which is identical — plus `batch`,
  // supplied by the shim below.
  __setDatabaseForTests(
    withBatchShim(client, database) as unknown as Parameters<typeof __setDatabaseForTests>[0],
  );

  return {
    reset: async () => {
      await client.exec("TRUNCATE panels, stripe_events, buildings RESTART IDENTITY CASCADE;");
    },
    close: async () => {
      __setDatabaseForTests(null);
      await client.close();
    },
  };
}

/**
 * Runs the committed Drizzle migrations, rather than pushing the schema
 * some other way: the test database is then built by exactly the SQL
 * that will build the production one.
 */
async function applyMigrations(client: PGlite): Promise<void> {
  const directory = path.join(process.cwd(), "drizzle");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(directory, file), "utf8");
    // Drizzle separates statements with its own marker; PGlite's exec
    // takes them one at a time.
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }
}

/**
 * Gives the PGlite database a `batch`, which only the neon-http driver
 * has — and which the idempotency queries are written against, because
 * neon-http cannot open a multi-statement transaction.
 *
 * Wrapping the statements in a real transaction is if anything a
 * stronger guarantee than Neon's batch, so a test that passes here would
 * pass there. Worth being explicit about what this does and does not
 * prove: it exercises *our* logic — the ordering, the unique-violation
 * branch, the rollback — not Neon's own atomicity, which only a live
 * database can show.
 */
function withBatchShim(client: PGlite, database: ReturnType<typeof drizzle<typeof schema>>) {
  return Object.assign(database, {
    async batch(queries: readonly PromiseLike<unknown>[]): Promise<unknown[]> {
      await client.exec("BEGIN");
      try {
        const results: unknown[] = [];
        // Sequentially, not Promise.all: these are Drizzle builders that
        // only run when awaited, and a batch's statements are ordered.
        for (const query of queries) results.push(await query);
        await client.exec("COMMIT");
        return results;
      } catch (error) {
        await client.exec("ROLLBACK");
        throw error;
      }
    },
  });
}
