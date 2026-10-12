import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { eventDetail, eventLabel, eventReason } from "@/components/platform/event-text";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROUTES } from "@/lib/auth/routes";
import { AUDIT_PAGE_SIZE, type AuditFilters, getAuditLog, getPlatformCenters } from "@/lib/data/platform";
import { formatDateTime } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).platformConsole.journal.title };
}

const ORIGINS = ["platform", "center", "automatic"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTION = /^[a-z_]+\.([a-z_]+)?$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function hrefFor(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.centerId) params.set("centre", filters.centerId);
  if (filters.action) params.set("action", filters.action);
  if (filters.origin) params.set("auteur", filters.origin);
  if (filters.from) params.set("du", filters.from);
  if (filters.to) params.set("au", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${ROUTES.platform.journal}?${query}` : ROUTES.platform.journal;
}

/** Journal de la plateforme : lecture seule, filtrable, paginé. */
export default async function PlatformJournalPage({ searchParams }: PageProps<"/platform/journal">) {
  const [LABELS, locale, params] = await Promise.all([getLabels(), getAppLocale(), searchParams]);
  const J = LABELS.platformConsole.journal;
  const centerId = first(params.centre);
  const action = first(params.action);
  const origin = first(params.auteur);
  const from = first(params.du);
  const to = first(params.au);
  const filters: AuditFilters = {
    centerId: UUID.test(centerId) ? centerId : null,
    action: ACTION.test(action) ? action : null,
    origin: ORIGINS.find((value) => value === origin) ?? null,
    from: ISO_DATE.test(from) ? from : null,
    to: ISO_DATE.test(to) ? to : null,
    page: Math.max(1, Math.min(10_000, Number.parseInt(first(params.page), 10) || 1)),
  };
  const [log, centers] = await Promise.all([getAuditLog(filters), getPlatformCenters()]);
  const pages = Math.max(1, Math.ceil(log.total / AUDIT_PAGE_SIZE));
  const families = Object.keys(J.families);
  const filtered = Boolean(filters.centerId || filters.action || filters.origin || filters.from || filters.to);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={J.title} description={J.description} />

      <form
        action={ROUTES.platform.journal}
        method="get"
        aria-label={J.filters}
        className="grid gap-3 rounded-xl bg-card p-5 shadow-card sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-centre">{J.center}</Label>
          <NativeSelect id="journal-centre" name="centre" defaultValue={filters.centerId ?? ""}>
            <option value="">{J.allCenters}</option>
            {centers.map((center) => (
              <option key={center.center_id} value={center.center_id}>
                {center.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-action">{J.action}</Label>
          <NativeSelect id="journal-action" name="action" defaultValue={filters.action ?? ""}>
            <option value="">{J.allActions}</option>
            {families.map((family) => (
              <optgroup key={family} label={J.families[family]}>
                <option value={family}>{J.families[family]}</option>
                {log.actions
                  .filter((name) => name.startsWith(family))
                  .map((name) => (
                    <option key={name} value={name}>
                      {eventLabel(name, LABELS.platform)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-auteur">{J.origin}</Label>
          <NativeSelect id="journal-auteur" name="auteur" defaultValue={filters.origin ?? ""}>
            <option value="">{J.allOrigins}</option>
            {ORIGINS.map((value) => (
              <option key={value} value={value}>
                {J.origins[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-du">{J.from}</Label>
          <Input id="journal-du" name="du" type="date" defaultValue={filters.from ?? ""} className="numeric font-normal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-au">{J.to}</Label>
          <Input id="journal-au" name="au" type="date" defaultValue={filters.to ?? ""} className="numeric font-normal" />
        </div>
        <div className="flex gap-2">
          <Button type="submit">{J.apply}</Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href={ROUTES.platform.journal}>{J.reset}</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <p className="text-section">{J.count(log.total)}</p>

      {log.events.length === 0 ? (
        <EmptyState icon={ScrollText} title={J.empty} description={J.emptyDescription} />
      ) : (
        <ol aria-label={J.caption} className="flex flex-col divide-y divide-divider rounded-xl bg-card shadow-card">
          {log.events.map((event) => {
            const detail = eventDetail(event, LABELS, locale);
            const reason = eventReason(event);
            const author = event.actor_name
              ? `${event.actor_name}${event.actor_is_platform ? ` (${J.origins.platform})` : ""}`
              : J.origins.automatic;
            return (
              <li key={event.event_id} className="grid gap-1 px-5 py-3 md:grid-cols-[10rem_minmax(0,1fr)_14rem] md:gap-4">
                <span className="numeric text-caption text-muted-foreground md:pt-0.5">{formatDateTime(event.occurred_at)}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-heading">
                    {eventLabel(event.action, LABELS.platform)}
                    {detail ? <span className="font-normal text-foreground"> · {detail}</span> : null}
                  </span>
                  {reason ? <span className="text-caption text-foreground">{LABELS.platform.reason(reason)}</span> : null}
                  {event.center_id && event.center_name ? (
                    <Link
                      href={`${ROUTES.platform.centers}/${event.center_id}`}
                      className="w-fit rounded-sm text-caption text-primary hover:underline"
                    >
                      {event.center_name}
                    </Link>
                  ) : null}
                </span>
                <span className="flex flex-col gap-0.5 text-caption text-muted-foreground md:text-end">
                  <span>{author}</span>
                  {event.ip_address ? (
                    <span className="numeric" dir="ltr">
                      {J.ip}
                      {LABELS.common.colon} {event.ip_address}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {pages > 1 ? (
        <nav aria-label={J.page(filters.page, pages)} className="flex items-center justify-between gap-3">
          {filters.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={hrefFor(filters, filters.page - 1)}>{J.previous}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-caption text-muted-foreground">{J.page(filters.page, pages)}</span>
          {filters.page < pages ? (
            <Button asChild variant="outline">
              <Link href={hrefFor(filters, filters.page + 1)}>{J.next}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
