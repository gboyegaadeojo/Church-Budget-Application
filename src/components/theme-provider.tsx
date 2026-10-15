"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Light, dark or system (DRD 3.3). next-themes sets the class before first paint,
 * so there is no flash of the wrong theme. The choice is kept in this browser for
 * now; it moves to the person's account once sign-in exists.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
