import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/site-header.tsx";
import "./globals.css";

// IBM Plex (guidelines section 4). next/font downloads the files when the app is built
// and serves them from this app, so the browser makes no request to Google. The first
// build or dev start needs internet; later builds reuse the downloaded files.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-plex-mono",
  fallback: ["ui-monospace", "Cascadia Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Ostensia",
  description: "Purchase mandates for AI shopping agents. Sandbox demo with a simulated shop.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
