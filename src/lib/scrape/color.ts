import { Vibrant } from "node-vibrant/node";

import { fetchWithLimits } from "./fetchWithLimits";

const FETCH_TIMEOUT_MS = 6000;
const MAX_FAVICON_BYTES = 1.5 * 1024 * 1024; // favicons are tiny; generous but bounded
const EXTRACTION_TIMEOUT_MS = 5000;

/** Neutral slate used whenever every candidate fails or yields nothing usable. */
export const FALLBACK_DOMINANT_COLOR = "#6b7280";

/**
 * Dominant color of a favicon, via node-vibrant (per brief).
 *
 * Tries each candidate in order and returns on the first success —
 * node-vibrant's Node/jimp backend only decodes raster formats, and a
 * site's *declared* icon is often SVG these days, so a single-URL
 * attempt would silently fall back to the neutral color far too often
 * (confirmed against real sites while building this). See
 * `ScrapedMetadata.faviconCandidates` for how the list is built.
 *
 * Deliberately defensive on top of that: node-vibrant's Node image
 * backend pulls in a `file-type` version with a known DoS advisory (an
 * infinite loop on a malformed ASF header, see `npm audit`). Since every
 * candidate URL comes from a site the buyer controls, that input is
 * untrusted by construction. A timeout does *not* contain it: the loop
 * only awaits already-resolved reads from an in-memory buffer, so it
 * never yields to the timer queue and `withTimeout` never fires — a
 * 200-byte file pinned the whole process (reproduced). The real guard is
 * `isDecodableRaster`: bytes only reach node-vibrant once their own
 * signature says PNG/JPEG/GIF/BMP, so `file-type` matches that format on
 * its first check and never reaches the ASF parser. The byte cap and the
 * timeouts stay for the ordinary slow/huge cases.
 */
export async function extractDominantColor(candidates: string[]): Promise<string> {
  for (const url of candidates) {
    const color = await tryExtract(url);
    if (color) return color;
  }
  return FALLBACK_DOMINANT_COLOR;
}

async function tryExtract(faviconUrl: string): Promise<string | null> {
  try {
    const bytes = await fetchWithLimits(faviconUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_FAVICON_BYTES,
    });
    if (!isDecodableRaster(bytes)) return null;

    const palette = await withTimeout(new Vibrant(bytes).getPalette(), EXTRACTION_TIMEOUT_MS);
    const swatch =
      palette.Vibrant ??
      palette.Muted ??
      palette.DarkVibrant ??
      palette.LightVibrant ??
      palette.DarkMuted ??
      palette.LightMuted;

    return swatch?.hex ?? null;
  } catch (error) {
    console.warn(`[scrape] dominant color extraction failed for ${faviconUrl}`, error);
    return null;
  }
}

const RASTER_SIGNATURES: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF8
  [0x42, 0x4d], // BMP
];

/**
 * Whether these bytes start with the signature of a format node-vibrant's
 * jimp backend decodes. Anything else (SVG, ICO, HTML error pages, and
 * crafted input aimed at `file-type`) is skipped before it gets there —
 * see `extractDominantColor`. TIFF is decodable but left out on purpose:
 * no site serves a TIFF favicon, and `file-type` parses TIFF well past
 * its signature.
 */
export function isDecodableRaster(bytes: Uint8Array): boolean {
  return RASTER_SIGNATURES.some(
    (signature) => bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("color extraction timed out")), ms)),
  ]);
}
