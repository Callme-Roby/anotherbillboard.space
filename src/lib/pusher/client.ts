import PusherClient from "pusher-js";

import { PLAZA_CHANNEL } from "../realtime";

let cached: PusherClient | undefined;

/** Browser-only; returns null (rather than throwing) when unconfigured so callers can degrade gracefully. */
export function getPusherClient(): PusherClient | null {
  if (typeof window === "undefined") return null;
  if (cached) return cached;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    console.warn("[realtime] NEXT_PUBLIC_PUSHER_KEY/NEXT_PUBLIC_PUSHER_CLUSTER not set — live updates disabled.");
    return null;
  }

  cached = new PusherClient(key, { cluster });
  return cached;
}

export type PlazaChannel = ReturnType<NonNullable<ReturnType<typeof getPusherClient>>["subscribe"]>;

export function subscribeToPlaza(): PlazaChannel | null {
  return getPusherClient()?.subscribe(PLAZA_CHANNEL) ?? null;
}
