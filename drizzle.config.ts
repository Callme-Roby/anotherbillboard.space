import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit reads process.env directly and loads no env files of its
// own, so `.env.local` — the file the README tells you to create, and
// the one Next itself reads — was invisible to it: `db:push` failed with
// an empty url against a perfectly good connection string. Loading it
// through Next's own loader rather than plain dotenv means these scripts
// see exactly what `next dev` sees, precedence rules included.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
