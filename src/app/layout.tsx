import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" }); // page titles and the university name only

export const metadata: Metadata = {
  title: "ReportFix",
  description: "Campus issue reporting: report, route, resolve, confirm.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#12355B" };

// Per-user, cookie-driven pages: never statically prerender.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <ToastProvider>
          <AppShell user={user}>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
