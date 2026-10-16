import type { Metadata, Viewport } from "next";
import { BrandStyle } from "@/components/app-shell/live-brand";
import { ThemeProvider } from "@/components/theme-provider";
import { copy } from "@/copy/en-CA";
// Inter (variable, self-hosted from npm) is loaded by globals.css (DRD 3.4).
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${copy.app.appName} · ${copy.app.churchName}`,
    template: `%s · ${copy.app.appName}`,
  },
  description: copy.app.metaDescription,
  // The administrator's square icon, or the default (FR-30).
  icons: { icon: "/brand/icon", apple: "/brand/icon" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes changes the class on <html> before first paint, so React must accept it.
    <html lang="en-CA" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full">
        <BrandStyle />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
