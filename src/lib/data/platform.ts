import "server-only";

import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Fn<Name extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][Name]["Returns"];

export type CenterStatus = Database["public"]["Enums"]["center_status"];
export type SubscriptionPlan = Database["public"]["Enums"]["subscription_plan"];
export type BillingInterval = Database["public"]["Enums"]["billing_interval"];
export type SubscriptionPaymentMethod = Database["public"]["Enums"]["subscription_payment_method"];

export type PlatformOverview = Fn<"platform_overview">[number];
export type OverdueCenter = Fn<"platform_overdue_centers">[number];
export type PlatformCenterRow = Fn<"platform_centers">[number];
export type PlatformCenterUser = Fn<"platform_center_users">[number];
export type PlatformEvent = Fn<"platform_center_events">[number];
export type PlatformPayment = Fn<"platform_payments">[number];
export type BillingMonth = Fn<"platform_billing_months">[number];

/** Marque blanche (colonnes de center_branding utiles à la fiche). */
const brandingSchema = z
  .object({
    brand_name: z.string().nullable(),
    logo_url: z.string().nullable(),
    primary_color: z.string().nullable(),
    secondary_color: z.string().nullable(),
    accent_color: z.string().nullable(),
    support_email: z.string().nullable(),
    support_phone: z.string().nullable(),
    custom_domain: z.string().nullable(),
    domain_verified: z.boolean(),
  })
  .nullable();

export type CenterBranding = NonNullable<z.infer<typeof brandingSchema>>;

export type PlatformCenter = Omit<Fn<"platform_center">[number], "branding"> & { branding: CenterBranding | null };

/**
 * Toutes les lectures de la console : garde serveur (404 pour tout autre
 * compte), puis fonctions platform_* qui revérifient le rôle en base.
 */
async function platformClient() {
  await requireSuperAdmin();
  return createClient();
}

export type PlatformDashboard = { overview: PlatformOverview; overdue: OverdueCenter[] };

export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const supabase = await platformClient();
  const [overview, overdue] = await Promise.all([
    supabase.rpc("platform_overview").single(),
    supabase.rpc("platform_overdue_centers"),
  ]);
  if (overview.error) throw overview.error;
  if (overdue.error) throw overdue.error;
  return { overview: overview.data, overdue: overdue.data };
}

export async function getPlatformCenters(): Promise<PlatformCenterRow[]> {
  const supabase = await platformClient();
  const { data, error } = await supabase.rpc("platform_centers");
  if (error) throw error;
  return data;
}

export type CenterTypeOption = { code: string; label: string };

export async function getCenterTypes(): Promise<CenterTypeOption[]> {
  const supabase = await platformClient();
  const { data, error } = await supabase.from("center_types").select("code, label").order("sort_order");
  if (error) throw error;
  return data;
}

export type PlatformCenterFile = {
  center: PlatformCenter;
  users: PlatformCenterUser[];
  events: PlatformEvent[];
  payments: PlatformPayment[];
};

export async function getPlatformCenterFile(centerId: string): Promise<PlatformCenterFile | null> {
  const supabase = await platformClient();
  const [center, users, events, payments] = await Promise.all([
    supabase.rpc("platform_center", { p_center_id: centerId }).maybeSingle(),
    supabase.rpc("platform_center_users", { p_center_id: centerId }),
    supabase.rpc("platform_center_events", { p_center_id: centerId }),
    supabase.rpc("platform_payments", { p_center_id: centerId }),
  ]);
  if (center.error) throw center.error;
  if (users.error) throw users.error;
  if (events.error) throw events.error;
  if (payments.error) throw payments.error;
  if (!center.data) return null;
  return {
    center: { ...center.data, branding: brandingSchema.parse(center.data.branding) },
    users: users.data,
    events: events.data,
    payments: payments.data,
  };
}

export type PlatformBilling = { months: BillingMonth[]; payments: PlatformPayment[] };

export async function getPlatformBilling(): Promise<PlatformBilling> {
  const supabase = await platformClient();
  const [months, payments] = await Promise.all([supabase.rpc("platform_billing_months"), supabase.rpc("platform_payments", {})]);
  if (months.error) throw months.error;
  if (payments.error) throw payments.error;
  return { months: months.data, payments: payments.data };
}
