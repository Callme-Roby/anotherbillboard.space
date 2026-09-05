import * as THREE from "three";

import { fetchPanels } from "@/lib/api/fetchPanels";
import type { PublicPanel } from "@/lib/api/serializePanel";
import { getPusherClient, subscribeToPlaza } from "@/lib/pusher/client";
import { PanelEvent } from "@/lib/realtime";

import { createGroundBillboard } from "../objects/createGroundBillboard";
import { createPanelMesh, createRealPanelMesh } from "../objects/createPanel";
import { placeholderRowLayout } from "../placeholders/layout";
import { MOCK_PANELS } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";
import { disposeObject3D } from "./disposeObject3D";
import { sceneEvents, VIEW_CHANGE_EVENT, type ViewChangeDetail } from "./sceneEvents";

// Only actually re-fetch once the zoom has moved a meaningful amount
// since the last fetch (not on every sub-pixel damping tick), and then
// only after this many ms of no *newer* zoom to react to — a throttle
// with a trailing edge, not a pure debounce: during one long continuous
// zoom gesture this still fires periodically (so panels keep revealing
// as you zoom, not just once you stop), just no more often than this.
const ZOOM_REFETCH_THRESHOLD = 0.08;
const REFETCH_DEBOUNCE_MS = 400;

/**
 * Owns the ground-panel group: shows the mock demo row until real
 * purchases exist, then keeps the *currently loaded* real-panel set
 * matched to the camera's zoom (see GET /api/panels's `zoom` budget) —
 * fewer panels at the default zoomed-out overview, more revealed as the
 * visitor zooms in — both as a reveal and as the perf win the brief
 * asks for (fewer meshes built/textured until asked for). Kept live via
 * Pusher (`panel:created`/`panel:updated`) on top of that, without ever
 * rebuilding the whole scene — only the changed billboard is touched.
 */
export class LivePanels {
  readonly group: THREE.Group;

  private readonly billboardsById = new Map<string, THREE.Group>();
  private usingMockPanels = true;
  private disposed = false;

  private lastFetchZoom = -1; // -1 (below any real zoom) guarantees the first event always fetches
  private pendingZoom: number | null = null;
  private refetchTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "panels";
    this.showMockPanels();
    sceneEvents.addEventListener(VIEW_CHANGE_EVENT, this.handleViewChange);
    // Guarantees an initial fetch happens even in the edge case where the
    // very first VIEW_CHANGE_EVENT's zoom lands within ZOOM_REFETCH_THRESHOLD
    // of 0 (so the listener above wouldn't otherwise trigger on it) — still
    // goes through the same debounced path, so a real zoom event arriving
    // during this window simply supersedes it with the fresher value.
    this.scheduleRefetch(0);
    this.subscribeToUpdates();
  }

  private showMockPanels() {
    const widths = MOCK_PANELS.map((panel) => (panel.size ?? sizeFromAmount(panel.amount)).width);
    const positions = placeholderRowLayout(widths);
    MOCK_PANELS.forEach((panel, i) => {
      const mesh = createPanelMesh(panel);
      const billboard = createGroundBillboard(mesh, { seed: panel.id, accent: panel.color });
      const pos = positions[i];
      billboard.position.set(pos.x, 0, pos.z);
      this.group.add(billboard);
    });
  }

  /** Called the moment any real panel is about to appear — mocks and real panels never mix. */
  private clearMockPanelsIfNeeded() {
    if (!this.usingMockPanels) return;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeObject3D(child); // recursive: each child is a billboard group, not a lone mesh
    }
    this.usingMockPanels = false;
  }

  private readonly handleViewChange = (event: Event) => {
    const { normalized } = (event as CustomEvent<ViewChangeDetail>).detail;
    if (Math.abs(normalized - this.lastFetchZoom) < ZOOM_REFETCH_THRESHOLD) return;
    this.scheduleRefetch(normalized);
  };

  private scheduleRefetch(zoom: number) {
    this.pendingZoom = zoom;
    if (this.refetchTimeoutId !== null) return; // already scheduled — will pick up the latest pendingZoom when it fires
    this.refetchTimeoutId = setTimeout(() => {
      this.refetchTimeoutId = null;
      const nextZoom = this.pendingZoom;
      this.pendingZoom = null;
      if (nextZoom === null || this.disposed) return;
      this.lastFetchZoom = nextZoom;
      void this.refetchForZoom(nextZoom);
    }, REFETCH_DEBOUNCE_MS);
  }

  private async refetchForZoom(zoom: number) {
    try {
      const panels = await fetchPanels({ zoom });
      if (this.disposed) return;
      this.clearMockPanelsIfNeeded();
      this.reconcile(panels);
    } catch (error) {
      console.error("[scene] failed to load panels from /api/panels — keeping the demo panels", error);
    }
  }

  /** Adds billboards newly within the current zoom's budget, removes ones that fell out of it. */
  private reconcile(panels: PublicPanel[]) {
    const desiredIds = new Set(panels.map((panel) => panel.id));
    for (const [id, billboard] of this.billboardsById) {
      if (desiredIds.has(id)) continue;
      this.group.remove(billboard);
      disposeObject3D(billboard);
      this.billboardsById.delete(id);
    }
    panels.forEach((panel) => this.upsertBillboard(panel));
  }

  private subscribeToUpdates() {
    const channel = subscribeToPlaza();
    if (!channel) return; // Pusher not configured — see getPusherClient

    const handle = (panel: PublicPanel) => {
      if (this.disposed) return;
      this.clearMockPanelsIfNeeded();
      this.upsertBillboard(panel);
    };
    channel.bind(PanelEvent.Created, handle);
    channel.bind(PanelEvent.Updated, handle);
  }

  private upsertBillboard(panel: PublicPanel) {
    const existing = this.billboardsById.get(panel.id);
    if (existing) {
      this.group.remove(existing);
      disposeObject3D(existing); // recursive: legs + panel, not a lone mesh
    }

    const mesh = createRealPanelMesh(panel);
    const billboard = createGroundBillboard(mesh, { seed: panel.id, accent: panel.dominantColor });
    billboard.position.set(panel.positionX, 0, panel.positionY);
    this.group.add(billboard);
    this.billboardsById.set(panel.id, billboard);
  }

  dispose() {
    this.disposed = true;
    sceneEvents.removeEventListener(VIEW_CHANGE_EVENT, this.handleViewChange);
    if (this.refetchTimeoutId !== null) clearTimeout(this.refetchTimeoutId);
    getPusherClient()?.disconnect();
    disposeObject3D(this.group);
    this.billboardsById.clear();
  }
}
