import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

/*
 * Inter is the closest widely-available face to Notion's system stack, which is
 * ui-sans-serif on macOS and Segoe UI on Windows. JetBrains Mono is reserved for
 * figures — durations, currency and metrics — where tabular alignment matters.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Synapse",
    template: "%s · Synapse",
  },
  description: "A quantified life OS — goals, time, money and training.",
};

export const viewport: Viewport = {
  themeColor: "#191919",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
