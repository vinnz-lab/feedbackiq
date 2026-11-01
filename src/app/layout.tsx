import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const DESCRIPTION =
  "Every customer voice. One clear roadmap. AI turns scattered feedback — surveys, emails, calls — into themes, a scored roadmap, digests and podcast-style audio briefings.";

export const metadata: Metadata = {
  // Absolute links for the preview image. On Vercel this falls back to the production address automatically.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: "Insight Hub — every customer voice, one clear roadmap", template: "%s · Insight Hub" },
  description: DESCRIPTION,
  applicationName: "Insight Hub",
  openGraph: { type: "website", siteName: "Insight Hub", title: "Insight Hub — every customer voice, one clear roadmap", description: DESCRIPTION, locale: "en_GB" },
  twitter: { card: "summary_large_image", title: "Insight Hub — every customer voice, one clear roadmap", description: DESCRIPTION },
};

// Set the theme before first paint to avoid a flash of the wrong mode.
const noFlashTheme = `
(function () {
  try {
    var t = localStorage.getItem('fiq-theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
