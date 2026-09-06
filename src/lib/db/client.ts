import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Don't throw here: this module can be imported by code paths that
  // never actually run a query (e.g. during `next build`), and Neon
  // isn't necessarily connected yet on a fresh deploy. Any real query
  // against the placeholder connection string below will fail loudly
  // with a clear connection error instead.
  console.warn(
    "[db] DATABASE_URL is not set — database calls will fail until the " +
      "Neon integration (Vercel Marketplace) is connected, or DATABASE_URL " +
      "is set in .env.local for local development.",
  );
}

const sql = neon(
  connectionString ?? "postgresql://user:password@localhost:5432/db",
);

type Database = ReturnType<typeof drizzle<typeof schema>>;

const neonDatabase: Database = drizzle(sql, { schema });

let testDatabase: Database | null = null;

/**
 * Points every query in the app at another database — an embedded
 * Postgres, in the offline test harness (see tests/support/database.ts).
 *
 * The seam exists because this project's whole payment chain talks to
 * Neon over HTTP, which cannot be reached from a test run with no
 * network: without it there is no way to exercise the webhook,
 * idempotency and placement code against a real database engine at all,
 * and those are exactly the paths where a bug costs a real payment.
 * Refused outside NODE_ENV=test so it can never be reached in a running
 * site, whatever ends up in the bundle.
 */
export function __setDatabaseForTests(instance: Database | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("__setDatabaseForTests is only available under NODE_ENV=test");
  }
  testDatabase = instance;
}

/**
 * Resolved per property access rather than captured once, so a test can
 * install its database after modules that imported `db` have already
 * been evaluated — which, imports being hoisted, is always.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const active = testDatabase ?? neonDatabase;
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
});
