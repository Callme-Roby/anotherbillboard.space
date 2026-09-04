import { extractDominantColor } from "./color";
import { scrapeMetadata } from "./metadata";

export interface ScrapedSite {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  dominantColor: string;
}

/**
 * Everything scraped from a buyer's URL at purchase time: title,
 * description, favicon, and the favicon's dominant color. Metadata and
 * color extraction run independently — a favicon-color failure (see
 * color.ts) never takes down title/description, and vice versa.
 */
export async function scrapeSite(url: string): Promise<ScrapedSite> {
  const metadata = await scrapeMetadata(url).catch((error) => {
    console.warn("[scrape] metadata extraction failed", error);
    return { title: null, description: null, faviconUrl: null, faviconCandidates: [] };
  });

  const dominantColor = await extractDominantColor(metadata.faviconCandidates);

  return {
    title: metadata.title,
    description: metadata.description,
    faviconUrl: metadata.faviconUrl,
    dominantColor,
  };
}
