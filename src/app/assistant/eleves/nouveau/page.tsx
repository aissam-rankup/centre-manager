import type { Metadata } from "next";

import { ScreenPlaceholder } from "@/components/shared/screen-placeholder";
import { LABELS } from "@/lib/constants/labels";

export const metadata: Metadata = { title: LABELS.nav.newStudent };

export default function NewStudentPage() {
  return <ScreenPlaceholder title={LABELS.nav.newStudent} />;
}
