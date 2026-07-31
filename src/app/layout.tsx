import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurum · Centro de mando Meta Ads",
  description: "Panel de métricas, embudo de lanzamiento y copiloto de IA para Meta Ads.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0b08" },
  ],
};

/** Stamp the saved theme before first paint so the page never flashes the wrong mode. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("aurum-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
