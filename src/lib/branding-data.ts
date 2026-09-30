import { z } from "zod";

const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable()
  .catch(null);
const text = z.string().nullable().catch(null);

/** Marque d'un centre en formule marque blanche (colonnes de center_branding). */
export const brandingSchema = z.object({
  brand_name: text,
  logo_url: text,
  favicon_url: text,
  primary_color: color,
  secondary_color: color,
  accent_color: color,
  login_background_url: text,
  email_sender_name: text,
  support_email: text,
  support_phone: text,
});

export type BrandingData = z.infer<typeof brandingSchema>;

export function parseBranding(value: unknown): BrandingData | null {
  if (!value || typeof value !== "object") return null;
  const parsed = brandingSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
