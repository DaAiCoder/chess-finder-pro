import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { OrientationBanner } from "@/components/OrientationBanner";

/** Account hub shell: top bar + Ask Tal only (no sidebar or bottom tabs). */
export function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <AppHeader chromeless />
      <OrientationBanner />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
