import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Another Billboard",
  description:
    "Scène 3D interactive : payez pour afficher la bannière de votre site sur un panneau ou un écran de bâtiment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
