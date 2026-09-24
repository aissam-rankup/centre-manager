import type { Metadata } from "next";

import { ScreenPlaceholder } from "@/components/shared/screen-placeholder";
import { LABELS } from "@/lib/constants/labels";

export const metadata: Metadata = { title: LABELS.nav.newTeacher };

export default function NewTeacherPage() {
  return <ScreenPlaceholder title={LABELS.nav.newTeacher} />;
}
