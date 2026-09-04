import * as THREE from "three";

import type { PublicPanel } from "@/lib/api/serializePanel";
import { PANEL_ASPECT_RATIO, sizeFromAmountCents } from "@/lib/economy";

import type { PlaceholderPanel } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";

const TEXTURE_SIZE = 256;
const FAVICON_LOAD_TIMEOUT_MS = 4000;

/**
 * A panel is always a flat textured plane — ground billboard or building
 * screen alike (buildings just place several of these on their faces).
 * The mock-data version's texture is a flat color field with a short
 * label; see createRealPanelMesh below for real (DB-backed) panels,
 * which additionally try to draw the scraped favicon.
 */
export function createPanelMesh(
  panel: PlaceholderPanel,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const { width, height } = panel.size ?? sizeFromAmount(panel.amount);

  const geometry = new THREE.PlaneGeometry(width, height);
  const canvas = drawPanelCanvas({ color: panel.color, label: panel.label });
  const material = new THREE.MeshBasicMaterial({ map: toTexture(canvas), side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `panel-${panel.id}`;
  mesh.userData.panel = panel;
  return mesh;
}

/**
 * Real, DB-backed panel: sized from its actual `size`/amount, textured
 * with its dominant color + title immediately (synchronous, matches the
 * placeholder look while the favicon loads), then upgraded in place with
 * the scraped favicon once it loads.
 *
 * Favicon loading is best-effort: it's an arbitrary external image, so
 * it can fail to load, or load but leave the canvas cross-origin-tainted
 * (most static hosts send permissive CORS for a favicon, but not all
 * do) — either way this falls back to the color+title look rather than
 * erroring. Loading every favicon directly from its origin like this
 * also means no caching/deduping across viewers; proxying + caching
 * favicons through our own origin (feeding into the texture atlas from
 * the brief's LOD section) is the next step here, not yet done.
 */
export function createRealPanelMesh(
  panel: PublicPanel,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const height = panel.size > 0 ? panel.size : sizeFromAmountCents(panel.amount);
  const width = height * PANEL_ASPECT_RATIO;

  const geometry = new THREE.PlaneGeometry(width, height);
  const label = panel.title || hostnameOf(panel.url) || "?";
  const color = panel.dominantColor || "#3a3d47";

  const canvas = drawPanelCanvas({ color, label });
  const material = new THREE.MeshBasicMaterial({ map: toTexture(canvas), side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `panel-${panel.id}`;
  mesh.userData.panel = panel;

  if (panel.faviconUrl) {
    // Best-effort upgrade once the favicon loads. If the mesh has since
    // been disposed (scene torn down while this was in flight), this is
    // a harmless no-op: disposal already released the GPU-side texture,
    // and nothing still renders this orphaned material to pick up the
    // update — `.dispose()` doesn't null out `.map`, so there's nothing
    // reliable to check here to skip it early.
    loadImage(panel.faviconUrl, FAVICON_LOAD_TIMEOUT_MS).then((image) => {
      if (!image || !material.map) return;
      drawFaviconOnto(canvas, image);
      material.map.needsUpdate = true;
    });
  }

  return mesh;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function drawPanelCanvas(params: { color: string; label: string }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = params.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(0, canvas.height - 56, canvas.width, 56);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shrink-to-fit: start large and step down until the label fits, so
  // both short codes ("AG") and longer titles/hostnames fit cleanly.
  let fontSize = 96;
  do {
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    fontSize -= 4;
  } while (ctx.measureText(params.label).width > canvas.width * 0.85 && fontSize > 16);

  ctx.fillText(params.label, canvas.width / 2, canvas.height / 2 - 16);

  return canvas;
}

function drawFaviconOnto(canvas: HTMLCanvasElement, image: CanvasImageSource): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Dim the existing background slightly so the icon reads clearly on
  // top of it, then draw the icon centered in the upper portion (the
  // label band at the bottom stays untouched).
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  ctx.fillRect(0, 0, canvas.width, canvas.height - 56);

  const iconSize = 112;
  const x = (canvas.width - iconSize) / 2;
  const y = (canvas.height - 56 - iconSize) / 2;
  ctx.drawImage(image, x, y, iconSize, iconSize);
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    const timeoutId = setTimeout(() => resolve(null), timeoutMs);
    const finish = (result: HTMLImageElement | null) => {
      clearTimeout(timeoutId);
      resolve(result);
    };

    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}
