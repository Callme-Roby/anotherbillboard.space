/**
 * The categories a buyer files their panel under.
 *
 * Two parallel declarations rather than one list of objects: the ids
 * must stay a literal tuple so `z.enum(PANEL_CATEGORIES)` in the claim
 * route validates against the actual values, and typing the labels as a
 * `Record<PanelCategory, string>` makes TypeScript refuse a new id
 * without a label — the two cannot drift apart.
 *
 * Ids, not display names, are what gets stored and what travels in
 * `GET /api/panels?category=…`: slugs survive a rename of the label,
 * and a URL query string is no place for "Crypto, Web3 & Investing".
 * `panels.category` itself stays free text (see schema.ts) so adding a
 * category never needs a migration; this list only constrains what the
 * funnel writes and what the filter offers.
 *
 * Order is the one they are displayed in, and it is deliberate — "other"
 * last, the rest roughly by how often they are expected to be picked.
 */
export const PANEL_CATEGORIES = [
  "ai-agents-infrastructure",
  "seo-ai-visibility",
  "marketing-advertising",
  "crypto-web3-investing",
  "developer-tools",
  "business-finance-legal",
  "security-privacy-compliance",
  "health-fitness-wellness",
  "social-media-creator-tools",
  "leaderboards-attention-markets",
  "hiring-jobs-careers",
  "education-learning",
  "agencies-studios-services",
  "ecommerce-retail",
  "domains-web-assets",
  "games-entertainment",
  "people-profiles",
  "productivity-personal-tools",
  "design-creative",
  "writing-content",
  "directories-launch-discovery",
  "ai-media-generation",
  "audio-voice-podcasting",
  "sales-lead-generation",
  "travel-local-lifestyle",
  "real-estate-property",
  "media-news",
  "other",
] as const;

export type PanelCategory = (typeof PANEL_CATEGORIES)[number];

/** What a buyer actually reads. */
export const PANEL_CATEGORY_LABELS: Record<PanelCategory, string> = {
  "ai-agents-infrastructure": "AI Agents & Infrastructure",
  "seo-ai-visibility": "SEO & AI Visibility",
  "marketing-advertising": "Marketing & Advertising",
  "crypto-web3-investing": "Crypto, Web3 & Investing",
  "developer-tools": "Developer Tools",
  "business-finance-legal": "Business, Finance & Legal",
  "security-privacy-compliance": "Security, Privacy & Compliance",
  "health-fitness-wellness": "Health, Fitness & Wellness",
  "social-media-creator-tools": "Social Media & Creator Tools",
  "leaderboards-attention-markets": "Leaderboards & Attention Markets",
  "hiring-jobs-careers": "Hiring, Jobs & Careers",
  "education-learning": "Education & Learning",
  "agencies-studios-services": "Agencies, Studios & Services",
  "ecommerce-retail": "Ecommerce & Retail",
  "domains-web-assets": "Domains & Web Assets",
  "games-entertainment": "Games & Entertainment",
  "people-profiles": "People & Profiles",
  "productivity-personal-tools": "Productivity & Personal Tools",
  "design-creative": "Design & Creative",
  "writing-content": "Writing & Content",
  "directories-launch-discovery": "Directories, Launch & Discovery",
  "ai-media-generation": "AI Media Generation",
  "audio-voice-podcasting": "Audio, Voice & Podcasting",
  "sales-lead-generation": "Sales & Lead Generation",
  "travel-local-lifestyle": "Travel, Local & Lifestyle",
  "real-estate-property": "Real Estate & Property",
  "media-news": "Media & News",
  "other": "Other",
};

/** The catch-all, and the claim form's default — see ClaimForm. */
export const FALLBACK_CATEGORY: PanelCategory = "other";

export const DEFAULT_CATEGORY_FILTER = "all" as const;

export function isKnownCategory(value: string): value is PanelCategory {
  return (PANEL_CATEGORIES as readonly string[]).includes(value);
}
