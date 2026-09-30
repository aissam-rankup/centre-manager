import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { LABELS } from "@/lib/constants/labels";
import { getPlatformSettings } from "@/lib/data/platform";
import { formatDateTime } from "@/lib/format";

import { SettingsForm } from "./settings-form";

const L = LABELS.platform.settings;

export const metadata: Metadata = { title: L.title };

export default async function PlatformSettingsPage() {
  const settings = await getPlatformSettings();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />
      <SectionCard title={L.contactTitle} description={L.updatedAt(formatDateTime(settings.updated_at))}>
        <SettingsForm
          defaults={{
            name: settings.support_name ?? "",
            phone: settings.support_phone ?? "",
            email: settings.support_email ?? "",
          }}
        />
      </SectionCard>
    </div>
  );
}
