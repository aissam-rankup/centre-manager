import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export default function StyleguideLayout({ children }: { children: ReactNode }) {
  return <AppShell space="styleguide">{children}</AppShell>;
}
