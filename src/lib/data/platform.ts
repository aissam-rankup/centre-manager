import "server-only";

import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { type CustomTermsInput, customTermsSchema } from "@/lib/validation/platform";

type Fn<Name extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][Name]["Returns"];

export type CenterStatus = Database["public"]["Enums"]["center_status"];
export type BillingInterval = Database["public"]["Enums"]["billing_interval"];
export type SubscriptionPaymentMethod = Database["public"]["Enums"]["subscription_payment_method"];

export type PlatformOverview = Fn<"platform_overview">[number];
export type OverdueCenter = Fn<"platform_overdue_centers">[number];
export type PlatformCenterRow = Fn<"platform_centers">[number];
export type PlatformCenterUser = Fn<"platform_center_users">[number];
export type PlatformEvent = Fn<"platform_center_events">[number];
export type PlatformPayment = Fn<"platform_payments">[number];
export type BillingMonth = Fn<"platform_billing_months">[number];
export type UpcomingDue = Fn<"platform_upcoming_due">[number];
export type PreparedNotification = Fn<"platform_upcoming_notifications">[number];
export type PlatformSettings = Fn<"platform_settings_get">[number];
export type PlatformPlan = Fn<"platform_plans">[number];
export type PlatformModule = Fn<"platform_modules">[number];
export type CenterModule = Fn<"platform_center_modules">[number];

/** Pack proposé dans les formulaires de la console. */
export type PlanOption = { key: string; name: string; description: string; monthlyPrice: number };

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

export type PlatformDashboard = {
  overview: PlatformOverview;
  overdue: OverdueCenter[];
  upcoming: UpcomingDue[];
  notifications: PreparedNotification[];
};

export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const supabase = await platformClient();
  const [overview, overdue, upcoming, notifications] = await Promise.all([
    supabase.rpc("platform_overview").single(),
    supabase.rpc("platform_overdue_centers"),
    supabase.rpc("platform_upcoming_due"),
    supabase.rpc("platform_upcoming_notifications", {}),
  ]);
  if (overview.error) throw overview.error;
  if (overdue.error) throw overdue.error;
  if (upcoming.error) throw upcoming.error;
  if (notifications.error) throw notifications.error;
  return { overview: overview.data, overdue: overdue.data, upcoming: upcoming.data, notifications: notifications.data };
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const supabase = await platformClient();
  const { data, error } = await supabase.rpc("platform_settings_get").single();
  if (error) throw error;
  return data;
}

/**
 * Libellés à clé fixe (types d'établissement, modules) dans la langue de l'utilisateur ;
 * le texte lu en base sert de repli pour une clé inconnue.
 */
async function catalogueNames() {
  const P = (await getLabels()).platform;
  return {
    centerType: (code: string, fallback: string) => P.centerTypeNames[code] ?? fallback,
    module: <T extends { name: string; description: string }>(key: string, row: T): T => {
      const known = P.moduleCatalogue[key];
      return known ? { ...row, name: known.name, description: known.description } : row;
    },
  };
}

export async function getPlatformCenters(): Promise<PlatformCenterRow[]> {
  const supabase = await platformClient();
  const [{ data, error }, names] = await Promise.all([supabase.rpc("platform_centers"), catalogueNames()]);
  if (error) throw error;
  return data.map((row) => ({ ...row, center_type_label: names.centerType(row.center_type, row.center_type_label) }));
}

export type CenterTypeOption = { code: string; label: string; isCustom: boolean; terms: CustomTermsInput };

export async function getCenterTypes(): Promise<CenterTypeOption[]> {
  const supabase = await platformClient();
  const [{ data, error }, names] = await Promise.all([
    supabase.from("center_types").select("code, label, is_custom, terms").order("sort_order"),
    catalogueNames(),
  ]);
  if (error) throw error;
  return data.map((row) => ({
    code: row.code,
    label: names.centerType(row.code, row.label),
    isCustom: row.is_custom,
    terms: customTermsSchema.parse(row.terms),
  }));
}

export type PlatformCenterFile = {
  center: PlatformCenter;
  users: PlatformCenterUser[];
  events: PlatformEvent[];
  payments: PlatformPayment[];
  modules: CenterModule[];
};

export type PlatformCenterAdmin = Fn<"platform_center_admins">[number];

/** Administrateurs d'un centre (console) : contact et dernière réinitialisation du mot de passe. */
export async function getPlatformCenterAdmins(centerId: string): Promise<PlatformCenterAdmin[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_center_admins", { p_center_id: centerId });
  if (error) throw error;
  return data;
}

export async function getPlatformCenterFile(centerId: string): Promise<PlatformCenterFile | null> {
  const supabase = await platformClient();
  const [center, users, events, payments, modules] = await Promise.all([
    supabase.rpc("platform_center", { p_center_id: centerId }).maybeSingle(),
    supabase.rpc("platform_center_users", { p_center_id: centerId }),
    supabase.rpc("platform_center_events", { p_center_id: centerId }),
    supabase.rpc("platform_payments", { p_center_id: centerId }),
    supabase.rpc("platform_center_modules", { p_center_id: centerId }),
  ]);
  if (center.error) throw center.error;
  if (users.error) throw users.error;
  if (events.error) throw events.error;
  if (payments.error) throw payments.error;
  if (modules.error) throw modules.error;
  if (!center.data) return null;
  const names = await catalogueNames();
  return {
    center: {
      ...center.data,
      center_type_label: names.centerType(center.data.center_type, center.data.center_type_label),
      branding: brandingSchema.parse(center.data.branding),
    },
    users: users.data,
    events: events.data,
    payments: payments.data,
    modules: modules.data.map((row) => names.module(row.module_key, row)),
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

export type PlatformCatalogue = { plans: PlatformPlan[]; modules: PlatformModule[] };

/** Catalogue : packs (prix, modules inclus) et modules activables. */
export async function getPlatformCatalogue(): Promise<PlatformCatalogue> {
  const supabase = await platformClient();
  const [plans, modules, names] = await Promise.all([supabase.rpc("platform_plans"), supabase.rpc("platform_modules"), catalogueNames()]);
  if (plans.error) throw plans.error;
  if (modules.error) throw modules.error;
  return { plans: plans.data, modules: modules.data.map((row) => names.module(row.key, row)) };
}

/** Packs proposés à la création d'un centre et au changement de pack. */
export async function getPlanOptions(): Promise<PlanOption[]> {
  const supabase = await platformClient();
  const { data, error } = await supabase.rpc("platform_plans");
  if (error) throw error;
  return data.map((plan) => ({
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPrice: Number(plan.monthly_price),
  }));
}
