import type { PublicPanel } from "./serializePanel";

/** Client-side fetch of GET /api/panels — see that route for the query params. */
export async function fetchPanels(params?: { category?: string }): Promise<PublicPanel[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", params.category);

  const response = await fetch(`/api/panels?${search.toString()}`);
  if (!response.ok) {
    throw new Error(`GET /api/panels failed: HTTP ${response.status}`);
  }

  const data: { panels: PublicPanel[] } = await response.json();
  return data.panels;
}
