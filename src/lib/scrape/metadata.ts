import * as cheerio from "cheerio";

import { fetchWithLimits } from "./fetchWithLimits";

export interface ScrapedMetadata {
  title: string | null;
  description: string | null;
  /** Best single candidate for display (the site's own declared icon). */
  faviconUrl: string | null;
  /**
   * Every icon URL discovered (declared `<link>` icons plus the
   * `/favicon.ico` convention), in the order color extraction should try
   * them. Kept separate from `faviconUrl`: a site's *declared* icon is
   * often SVG these days, which node-vibrant's Node/jimp backend can't
   * rasterize — trying the other candidates (apple-touch-icon and
   * favicon.ico are both almost always PNG/ICO) meaningfully improves
   * the odds of getting a real dominant color instead of the fallback.
   */
  faviconCandidates: string[];
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2MB — generous for a homepage's HTML
const USER_AGENT = "Mozilla/5.0 (compatible; AnotherBillboardBot/1.0; +https://anotherbillboard.space)";

/**
 * `og:title`/`og:description` first (per brief), falling back to
 * `<title>`/meta description; favicon via the usual `<link rel="icon">`
 * variants, falling back to the `/favicon.ico` convention.
 */
export async function scrapeMetadata(pageUrl: string): Promise<ScrapedMetadata> {
  const html = await fetchWithLimits(pageUrl, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_HTML_BYTES,
    headers: { "user-agent": USER_AGENT },
  });

  const $ = cheerio.load(html.toString("utf-8"));

  const title = firstNonEmpty($('meta[property="og:title"]').attr("content"), $("title").first().text());

  const description = firstNonEmpty(
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
  );

  // Preference order for the *displayed* favicon: the site's own <link
  // rel="icon"> (or "shortcut icon"), else apple-touch-icon.
  const declaredIconHref = firstNonEmpty(
    $('link[rel="icon"]').attr("href"),
    $('link[rel="shortcut icon"]').attr("href"),
    $('link[rel="apple-touch-icon"]').attr("href"),
  );
  const faviconUrl = resolveUrl(declaredIconHref ?? "/favicon.ico", pageUrl);

  // Every candidate, for color extraction to try in sequence.
  const rawHrefs = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')
    .map((_, el) => $(el).attr("href"))
    .get()
    .filter((href): href is string => Boolean(href));
  rawHrefs.push("/favicon.ico");

  const faviconCandidates = dedupe(
    rawHrefs.map((href) => resolveUrl(href, pageUrl)).filter((url): url is string => Boolean(url)),
  );

  return {
    title: title?.trim() || null,
    description: description?.trim() || null,
    faviconUrl,
    faviconCandidates,
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
