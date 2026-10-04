import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BrandingForm } from "@/components/branding/branding-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireModule, requireRole } from "@/lib/auth/session";
import { dnsTarget, getBrandingSettings } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.branding;

export const metadata: Metadata = { title: L.title };

/** Marque du centre : module marque blanche uniquement (sinon : non modifiable). */
export default async function BrandingPage() {
  const profile = await requireRole("admin");
  requireModule(profile, "white_label");
  if (profile.support) notFound();
  const settings = await getBrandingSettings(profile.centerId);
  if (!settings?.editable) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />
      <SectionCard title={L.title}>
        <BrandingForm
          defaults={{ centerId: profile.centerId, ...settings.values }}
          superAdmin={false}
          domainVerified={settings.domainVerified}
          dnsTarget={dnsTarget()}
        />
      </SectionCard>
    </div>
  );
}
