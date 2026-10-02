import "server-only";

import { requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getCenterReceiptSettings } from "@/lib/data/receipts";
import { getLabels } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";

export type CenterPdfBrand = { name: string; contact: string | null; logoUrl: string | null; color: string };

/** En-tête des documents du centre : sa marque en marque blanche, sinon son nom ; jamais la plateforme. */
export async function getCenterPdfBrand(): Promise<CenterPdfBrand> {
  const profile = await requireStaff();
  const [brand, settings, LABELS] = await Promise.all([getSessionBrand(), getCenterReceiptSettings(), getLabels()]);
  const contact = [settings.address, settings.phone ? LABELS.receipts.phone(formatPhone(settings.phone)) : null].filter(Boolean).join(" · ");
  return {
    name: brand.whiteLabel ? brand.name : profile.centerName,
    contact: contact || null,
    logoUrl: brand.logoUrl,
    color: brand.colors.primary ?? "#6c2bf5",
  };
}
