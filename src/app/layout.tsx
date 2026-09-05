import type { Metadata, Viewport } from "next";

import { SITE_NAME } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  title: SITE_NAME,
  description:
    "Scène 3D interactive : payez pour afficher la bannière de votre site sur un panneau ou un écran de bâtiment.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The scene has its own pinch-to-zoom (CameraController) — letting the
  // browser *also* pinch-zoom the page would fight it and break the
  // fixed-UI layout, so the page itself is locked to scale 1.
  maximumScale: 1,
  userScalable: false,
  // Lets the page extend under a notch/home-indicator so env(safe-area-
  // inset-*) reports real values instead of always 0 — used to keep the
  // fixed HUD (legend, minimap, purchase button) clear of those areas.
  viewportFit: "cover",
  themeColor: "#f4f4f5",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
