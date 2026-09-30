import { z } from "zod";

import { LABELS } from "@/lib/constants/labels";
import { isValidPhone } from "@/lib/phone";

const L = LABELS.branding;
const V = LABELS.platform.validation;

const color = z
  .string()
  .trim()
  .refine((value) => value === "" || /^#[0-9a-f]{6}$/i.test(value), L.colorInvalid);
const url = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\//.test(value), L.uploadFailed);

export const brandingFormSchema = z.object({
  centerId: z.uuid(),
  brandName: z.string().trim().max(80, V.tooLong),
  logoUrl: url,
  faviconUrl: url,
  loginBackgroundUrl: url,
  primaryColor: color,
  secondaryColor: color,
  accentColor: color,
  senderName: z.string().trim().max(80, V.tooLong),
  supportEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || z.email().safeParse(value).success, V.emailInvalid),
  supportPhone: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidPhone(value), V.phoneInvalid),
  /** Super-admin uniquement (ignoré en base pour un administrateur de centre). */
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(value), L.domainInvalid),
});

export type BrandingFormInput = z.infer<typeof brandingFormSchema>;

export const BRANDING_IMAGE_KINDS = ["logo", "favicon", "background"] as const;
export type BrandingImageKind = (typeof BRANDING_IMAGE_KINDS)[number];
export const BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};
