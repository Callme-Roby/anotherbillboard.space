import Stripe from "stripe";

let cached: Stripe | undefined;

/**
 * Lazy singleton, same rationale as `src/lib/db/client.ts`: constructing
 * eagerly at module scope would throw at import time whenever
 * `STRIPE_SECRET_KEY` isn't set yet (e.g. before the Vercel env var is
 * configured), which would take down any route that merely imports this
 * module. Deferring construction means only routes that actually call
 * `getStripe()` — i.e. actually need to talk to Stripe — require the key.
 */
export function getStripe(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to the Vercel project's environment variables (or .env.local for local dev).",
    );
  }

  cached = new Stripe(secretKey);
  return cached;
}
