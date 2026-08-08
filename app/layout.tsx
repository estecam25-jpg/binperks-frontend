import type { Metadata } from "next";
import "./globals.css";

/**
 * Icons are declared here rather than through Next's app/ file convention.
 *
 * The two mechanisms do not merge — an app/favicon.ico is picked up
 * automatically and emits its own <link> alongside whatever this config
 * declares, which is how the stock create-next-app icon kept winning. That
 * file has been deleted; every icon now lives in public/ and is listed below,
 * so there is exactly one source of truth.
 *
 * favicon.ico is a real multi-resolution container (16/32/48) rather than a
 * single rescaled bitmap, so browsers pick the size they need instead of
 * downsampling a large PNG themselves.
 */
export const metadata: Metadata = {
  title: "BinPerks",
  description: "Loyalty rewards for bin stores",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    // Flattened onto white at build time: iOS composites transparent pixels
    // against black, which would put the red logo circle on a black square.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Coiny&family=Montserrat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}