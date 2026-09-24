import type { Metadata } from "next";

import { ScreenPlaceholder } from "@/components/shared/screen-placeholder";
import { LABELS } from "@/lib/constants/labels";

export const metadata: Metadata = { title: LABELS.nav.subjects };

export default function AdminSubjectsPage() {
  return <ScreenPlaceholder title={LABELS.nav.subjects} />;
}
