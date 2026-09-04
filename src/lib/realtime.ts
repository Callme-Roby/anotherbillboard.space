/**
 * Realtime channel/event naming shared between the server (triggers, via
 * src/lib/pusher/server.ts) and the browser (subscribes, via
 * src/three/engine/SceneManager's data layer). No secrets here — safe to
 * import from client components.
 */
export const PLAZA_CHANNEL = "plaza";

export const PanelEvent = {
  /** A brand-new panel was created (payment confirmed + URL claimed). */
  Created: "panel:created",
  /** An existing panel's amount/size changed (boosted). */
  Updated: "panel:updated",
} as const;

export const BuildingEvent = {
  /** A new building was unlocked, or the central ranking changed. */
  Changed: "building:changed",
} as const;
