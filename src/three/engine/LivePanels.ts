import * as THREE from "three";

import { fetchPanels } from "@/lib/api/fetchPanels";
import type { PublicPanel } from "@/lib/api/serializePanel";
import { getPusherClient, subscribeToPlaza } from "@/lib/pusher/client";
import { PanelEvent } from "@/lib/realtime";

import { createPanelMesh, createRealPanelMesh } from "../objects/createPanel";
import { placeholderRowLayout } from "../placeholders/layout";
import { MOCK_PANELS } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";
import { disposeObject3D } from "./disposeObject3D";

/**
 * Owns the ground-panel group: shows the mock demo row until real
 * purchases exist, fetches real panels, and keeps them live via Pusher
 * (`panel:created`/`panel:updated`) without ever rebuilding the whole
 * scene — only the changed mesh is touched.
 */
export class LivePanels {
  readonly group: THREE.Group;

  private readonly meshesById = new Map<string, THREE.Mesh>();
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
      const pos = positions[i];
      mesh.position.set(pos.x, mesh.geometry.parameters.height / 2, pos.z);
      this.group.add(mesh);
    });
  }

  /** Called the moment any real panel is about to appear — mocks and real panels never mix. */
  private clearMockPanelsIfNeeded() {
    if (!this.usingMockPanels) return;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      disposeObject3D(child, false);
    }
    this.usingMockPanels = false;
  }

  private async loadRealPanels() {
    try {
      const panels = await fetchPanels();
      if (this.disposed || panels.length === 0) return;
      this.clearMockPanelsIfNeeded();
      panels.forEach((panel) => this.upsertMesh(panel));
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
      this.upsertMesh(panel);
    };
    channel.bind(PanelEvent.Created, handle);
    channel.bind(PanelEvent.Updated, handle);
  }

  private upsertMesh(panel: PublicPanel) {
    const existing = this.meshesById.get(panel.id);
    if (existing) {
      this.group.remove(existing);
      disposeObject3D(existing, false);
    }

    const mesh = createRealPanelMesh(panel);
    mesh.position.set(panel.positionX, panel.size / 2, panel.positionY);
    this.group.add(mesh);
    this.meshesById.set(panel.id, mesh);
  }

  dispose() {
    this.disposed = true;
    getPusherClient()?.disconnect();
    disposeObject3D(this.group);
    this.meshesById.clear();
  }
}
