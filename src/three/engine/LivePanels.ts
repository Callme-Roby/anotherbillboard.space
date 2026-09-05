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

/**
 * Owns the ground-panel group: shows the mock demo row until real
 * purchases exist, fetches real panels, and keeps them live via Pusher
 * (`panel:created`/`panel:updated`) without ever rebuilding the whole
 * scene — only the changed billboard is touched.
 */
export class LivePanels {
  readonly group: THREE.Group;

  private readonly billboardsById = new Map<string, THREE.Group>();
  private usingMockPanels = true;
  private disposed = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "panels";
    this.showMockPanels();
    void this.loadRealPanels();
    this.subscribeToUpdates();
  }

  private showMockPanels() {
    const widths = MOCK_PANELS.map((panel) => (panel.size ?? sizeFromAmount(panel.amount)).width);
    const positions = placeholderRowLayout(widths);
    MOCK_PANELS.forEach((panel, i) => {
      const mesh = createPanelMesh(panel);
      const billboard = createGroundBillboard(mesh);
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
      disposeObject3D(child); // recursive: each child is now a billboard group, not a lone mesh
    }
    this.usingMockPanels = false;
  }

  private async loadRealPanels() {
    try {
      const panels = await fetchPanels();
      if (this.disposed || panels.length === 0) return;
      this.clearMockPanelsIfNeeded();
      panels.forEach((panel) => this.upsertBillboard(panel));
    } catch (error) {
      console.error("[scene] failed to load panels from /api/panels — keeping the demo panels", error);
    }
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
    const billboard = createGroundBillboard(mesh);
    billboard.position.set(panel.positionX, 0, panel.positionY);
    this.group.add(billboard);
    this.billboardsById.set(panel.id, billboard);
  }

  dispose() {
    this.disposed = true;
    getPusherClient()?.disconnect();
    disposeObject3D(this.group);
    this.billboardsById.clear();
  }
}
