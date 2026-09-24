import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

// Charte graphique : outil de développement, absente en production.
export default function StyleguideLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <AppShell space="styleguide">{children}</AppShell>;
}
