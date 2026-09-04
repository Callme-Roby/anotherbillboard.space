import PusherServer from "pusher";

import { PLAZA_CHANNEL } from "../realtime";

let cached: PusherServer | undefined;

/** Lazy singleton — see src/lib/stripe.ts for why. */
function getPusherServer(): PusherServer {
  if (cached) return cached;

  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    throw new Error(
      "Pusher server env vars are not fully set (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER).",
    );
  }

  cached = new PusherServer({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return cached;
}

/**
 * Broadcast one realtime event to every connected visitor. Failures are
 * logged, not thrown — a broadcast hiccup must never fail the purchase
 * itself (the panel is already committed in the DB; the client falls
 * back to picking it up on its next `GET /api/panels` poll/refresh).
 */
export async function broadcastToPlaza(event: string, data: unknown): Promise<void> {
  try {
    const pusher = getPusherServer();
    await pusher.trigger(PLAZA_CHANNEL, event, data);
  } catch (error) {
    console.error(`[realtime] failed to broadcast "${event}"`, error);
  }
}
