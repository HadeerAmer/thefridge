import type { Metadata, Viewport } from "next";
import { Anton, Caveat, DM_Sans, Lilita_One } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Providers } from "@/components/providers";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });
const lilita = Lilita_One({ subsets: ["latin"], weight: "400", variable: "--font-lilita", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: { default: "The Fridge — Always a good cal(l)", template: "%s · The Fridge" },
  description: "Good calories for life on the go. Reserve from the nearest Fridge, collect with a QR, track your macros.",
  applicationName: "The Fridge",
};

export const viewport: Viewport = {
  themeColor: "#1f5a34",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${anton.variable} ${lilita.variable} ${caveat.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
