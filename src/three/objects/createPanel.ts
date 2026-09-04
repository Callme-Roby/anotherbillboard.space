import * as THREE from "three";

import type { PlaceholderPanel } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";

/**
 * A panel is always a flat textured plane — ground billboard or building
 * screen alike (buildings just place several of these on their faces).
 * The texture stands in for a scraped site banner: a flat color field
 * with the site's short label, generated on an offscreen canvas.
 */
export function createPanelMesh(
  panel: PlaceholderPanel,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const { width, height } = panel.size ?? sizeFromAmount(panel.amount);

  const geometry = new THREE.PlaneGeometry(width, height);
  const texture = createPlaceholderTexture(panel);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `panel-${panel.id}`;
  mesh.userData.panel = panel;
  return mesh;
}

function createPlaceholderTexture(panel: PlaceholderPanel): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = panel.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(0, canvas.height - 56, canvas.width, 56);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shrink-to-fit: start large and step down until the label fits, so
  // both short codes ("AG") and the longer signature label fit cleanly.
  let fontSize = 96;
  do {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    fontSize -= 4;
  } while (ctx.measureText(panel.label).width > canvas.width * 0.85 && fontSize > 16);

  ctx.fillText(panel.label, canvas.width / 2, canvas.height / 2 - 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
