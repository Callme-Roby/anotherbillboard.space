/**
 * Webhook idempotency helper. `neon-http` has no multi-round-trip
 * transactions ("No transactions support in neon-http driver" — checked
 * directly against the installed driver), but Drizzle's `db.batch(...)`
 * sends multiple statements as one atomic HTTP round trip via Neon's own
 * batch/transaction endpoint, which is enough: recording "this Stripe
 * event was processed" and applying its effect (create/update a panel)
 * happen together, so a crash between the two can't happen — either
 * both land or neither does.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
  if (code === "23505") return true;

  // Defensive fallback: the exact error shape surfaced through
  // @neondatabase/serverless over HTTP isn't verifiable without a live
  // database in this environment, so also match on message content.
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate key value violates unique constraint/i.test(message);
}
