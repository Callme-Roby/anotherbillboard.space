import * as THREE from "three";

import type { PublicPanel } from "@/lib/api/serializePanel";
import { PANEL_ASPECT_RATIO, sizeFromAmountCents } from "@/lib/economy";

import type { PlaceholderPanel } from "../placeholders/mockPanels";
import { sizeFromAmount } from "../placeholders/sizing";

/**
 * Panel texture, in the panel's own aspect ratio rather than square. A
 * square canvas stretched across a 16:9 plane widens every glyph on it
 * by the aspect ratio — which is exactly what made titles look squashed
 * wide before, and would only have got worse as the panels moved from
 * 1.35:1 to 16:9.
 *
 * 512 across rather than 256: the panels are the one thing on the site
 * you are meant to zoom in and *read*, so their texture should still
 * have detail left when you do.
 */
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = Math.round(TEXTURE_WIDTH / PANEL_ASPECT_RATIO);
const FAVICON_LOAD_TIMEOUT_MS = 4000;

/**
 * A panel is always a flat textured plane — ground billboard or building
 * screen alike (a building screen is one or more of these, arranged by
 * createScreenRig.ts).
 * The mock-data version's texture is a flat color field with a short
 * label; see createRealPanelMesh below for real (DB-backed) panels,
 * which additionally try to draw the scraped favicon.
 */
export function createPanelMesh(
  panel: PlaceholderPanel,
  sizeOverride?: { width: number; height: number },
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  // Screen rigs (createScreenRig.ts) size their own faces — a wrap's two
  // halves and a stack's ticker strip are dimensions of the *mount*, not
  // of the panel's content — so they pass an override rather than
  // encoding one size per face back into the panel data.
  const { width, height } = sizeOverride ?? panel.size ?? sizeFromAmount(panel.amount);

  const geometry = new THREE.PlaneGeometry(width, height);
  const canvas = drawPanelCanvas({ color: panel.color, title: panel.label });
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

  const canvas = drawPanelCanvas({ color, title: label, description: panel.description });
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
      paintPanel(canvas, { color, title: label, description: panel.description, favicon: image });
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

interface PanelFace {
  color: string;
  title: string;
  description?: string | null;
  favicon?: CanvasImageSource | null;
}

function drawPanelCanvas(face: PanelFace): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  paintPanel(canvas, face);
  return canvas;
}

/**
 * Paints the whole face from scratch every time, so the favicon arriving
 * late is a repaint rather than a patch drawn over the previous state —
 * the old version dimmed the background and stamped the icon on top,
 * which could only be done once and left the panel darker for it.
 */
function paintPanel(canvas: HTMLCanvasElement, face: PanelFace): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = face.color;
  ctx.fillRect(0, 0, w, h);

  // A description needs a band deep enough to sit in; a bare code ("AG")
  // just needs a footer so the panel doesn't read as a plain colour chip.
  const bandTop = face.description ? h * 0.56 : h * 0.8;
  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.fillRect(0, bandTop, w, h - bandTop);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let titleY = bandTop * 0.5;
  if (face.favicon) {
    const size = Math.round(h * 0.3);
    ctx.drawImage(face.favicon, (w - size) / 2, bandTop * 0.5 - size * 0.92, size, size);
    titleY = bandTop * 0.5 + size * 0.5;
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, face.title, w * 0.88, Math.round(h * 0.32));
  ctx.fillText(face.title, w / 2, titleY);

  if (face.description) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    const size = Math.round(h * 0.1);
    ctx.font = `${size}px system-ui, sans-serif`;
    const lines = wrapLines(ctx, face.description, w * 0.9, 2);
    const bandHeight = h - bandTop;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, bandTop + bandHeight * (lines.length === 1 ? 0.5 : 0.32 + i * 0.38));
    });
  }
}

/** Largest font size at or below `startSize` that fits `maxWidth`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
): string {
  let size = startSize;
  let font = `bold ${size}px system-ui, sans-serif`;
  ctx.font = font;
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    font = `bold ${size}px system-ui, sans-serif`;
    ctx.font = font;
  }
  return font;
}

/**
 * Word-wraps to at most `maxLines`, ellipsising whatever doesn't fit.
 *
 * Note the two separate ways text can overflow: a line can be too wide,
 * *or* the description can simply run past `maxLines` while every line
 * still fits its width. Only the first was handled at first, so a
 * description cut short by the line limit ended mid-sentence with no
 * ellipsis at all — spotted by rendering a real one, not by reading the
 * code.
 */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let dropped = false;

  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    // A single word wider than the line still goes on it, then gets
    // ellipsised below — better than an empty line and a stuck loop.
    if (!line || ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (lines.length + 1 === maxLines) {
      dropped = true;
      break;
    }
    lines.push(line);
    line = words[i];
  }
  if (line) lines.push(line);
  if (lines.length === 0) return lines;

  const lastIndex = lines.length - 1;
  if (dropped || ctx.measureText(lines[lastIndex]).width > maxWidth) {
    lines[lastIndex] = ellipsise(ctx, lines[lastIndex], maxWidth);
  }
  return lines;
}

/** Trims until the text plus its ellipsis fits. */
function ellipsise(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
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
