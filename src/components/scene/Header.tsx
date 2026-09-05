import { SITE_NAME } from "@/lib/site";

/**
 * Site name, top-center — small HUD-style chrome (matches Legend/
 * Minimap's scale and treatment) rather than a full-width nav bar, since
 * there's no navigation to hold on a one-page site. Unlike the other HUD
 * pieces this carries real content (not `aria-hidden`): it's the page's
 * only heading.
 */
export function Header() {
  return (
    <h1 className="pointer-events-none fixed left-1/2 top-[calc(1rem+var(--safe-top))] -translate-x-1/2 whitespace-nowrap rounded border border-white/20 bg-black/30 px-4 py-2 font-mono text-sm font-semibold tracking-wide text-white backdrop-blur-sm">
      {SITE_NAME}
    </h1>
  );
}
