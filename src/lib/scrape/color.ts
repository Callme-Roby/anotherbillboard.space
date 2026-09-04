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
 * backend pulls in a `file-type` version with a known moderate DoS
 * advisory (an infinite loop on certain malformed input, see `npm
 * audit`). Since every candidate URL comes from a site the buyer
 * controls, that input is untrusted by construction. Rather than drop
 * node-vibrant (named directly in the brief), this is contained: a byte
 * cap on the fetch, a timeout on the fetch, and a separate timeout on
 * extraction itself — worst case, one candidate eats its own timeout
 * and extraction moves on to the next (or the fallback color) instead
 * of hanging.
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("color extraction timed out")), ms)),
  ]);
}
