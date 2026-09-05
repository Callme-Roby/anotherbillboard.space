import type { PublicPanel } from "./serializePanel";

/** Client-side fetch of GET /api/panels — see that route for the query params. */
export async function fetchPanels(params?: { category?: string; zoom?: number }): Promise<PublicPanel[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);
  if (params?.zoom !== undefined) search.set("zoom", params.zoom.toFixed(3));

  const response = await fetch(`/api/panels?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`GET /api/panels failed: HTTP ${response.status}`);
  }

  const data: { panels: PublicPanel[] } = await response.json();
  return data.panels;
}
