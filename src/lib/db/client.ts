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

export const db = drizzle(sql, { schema });
