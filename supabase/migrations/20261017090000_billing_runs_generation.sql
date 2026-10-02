-- =====================================================================
-- CentroManager — 035 : préparation automatique des campagnes
-- (page 8, phase 2)
--
--  * Chaque nuit, pour chaque centre qui a activé la réinscription
--    automatique, la campagne du mois suivant est préparée en brouillon dès
--    le jour de préparation (rattrapage les jours suivants si la nuit a été
--    manquée) : une ligne par inscription ou abonnement pack actif dont la
--    période commence dans le mois (cycle du 1er et cycle du 15), au tarif
--    convenu, remise déjà déduite ; une intention « en attente » par élève.
--    Un centre en échec ne bloque ni les autres centres, ni le reste du job.
--  * Tant qu'il est en brouillon, il suit les inscriptions (arrêt, reprise,
--    passage au pack), les remises et le jour d'échéance du centre.
--  * Le brouillon n'émet aucune facture. Pour un mois couvert par une
--    campagne, ni la facturation quotidienne, ni la reprise d'une
--    inscription ne facturent les lignes de la campagne (elles le seront à
--    la confirmation), et plus rien du tout si le mois a été annulé (mois
--    sans cours). Sans campagne pour le mois, ou réinscription désactivée,
--    rien ne change.
--  * Factures de campagne : en retard le lendemain de l'échéance. Toutes les
--    règles de retard lisent désormais invoices.overdue_from ; le « reste
--    dû » des reçus compte toujours ce qui est dû à la date du jour.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Date de retard
-- ---------------------------------------------------------------------
alter table public.invoices
  add column overdue_from date generated always as (
    case when billing_run_id is null then due_date else due_date + 1 end
  ) stored;

comment on column public.invoices.overdue_from is
  'Premier jour de retard : l''échéance (règle historique) ; le lendemain pour une facture de campagne.';

create index invoices_status_overdue_from_idx on public.invoices (status, overdue_from);

comment on function private.invoice_is_overdue(public.invoice_status, date) is
  'En retard : statut overdue, ou en attente à partir de la date donnée (passer invoices.overdue_from).';

create or replace function private.mark_overdue_invoices(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with switched as (
    update public.invoices
    set status = 'overdue'
    where status = 'pending' and overdue_from <= p_date
    returning id, student_id, amount_due, due_date
  ),
  alerted as (
    insert into public.alerts (student_id, type, payload)
    select s.student_id, 'overdue_payment',
           jsonb_build_object('invoice_id', s.id, 'amount_due', s.amount_due, 'due_date', s.due_date)
    from switched s
    where not exists (
      select 1 from public.alerts a
      where a.type = 'overdue_payment' and a.payload ->> 'invoice_id' = s.id::text
    )
    returning 1
  )
  select count(*)::integer into v_count from switched;
  return v_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.assistant_dashboard_stats()
 RETURNS TABLE(unpaid_count integer, unpaid_amount numeric, overdue_count integer, overdue_amount numeric, overdue_students integer, absences_today integer, open_absence_alerts integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    (select count(*)::integer from public.invoices i where i.status <> 'paid'),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i where i.status <> 'paid'),
    (select count(*)::integer from public.invoices i where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select coalesce(sum(i.amount_due - i.amount_paid), 0) from public.invoices i
      where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select count(distinct i.student_id)::integer from public.invoices i
      where private.invoice_is_overdue(i.status, i.overdue_from)),
    (select count(*)::integer from public.attendance a
      where a.session_date = private.today() and a.status = 'absent'),
    (select count(*)::integer from public.alerts al
      where al.type = 'consecutive_absences' and not al.resolved);
$function$;

CREATE OR REPLACE FUNCTION public.cancel_receipt(p_receipt_id uuid, p_reason text)
 RETURNS receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_original public.receipts;
  v_cancel public.receipts;
  v_year smallint := extract(year from now() at time zone 'Africa/Casablanca')::smallint;
begin
  select * into v_original from public.receipts r where r.id = p_receipt_id for update;
  if v_original.id is null or not private.is_admin() or v_original.center_id is distinct from private.auth_center_id() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_original.kind <> 'payment' then
    raise exception 'Un reçu d''annulation ne s''annule pas.' using errcode = '22023';
  end if;
  if exists (select 1 from public.receipts r where r.cancels_receipt_id = p_receipt_id) then
    raise exception 'Ce reçu est déjà annulé.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de l''annulation.' using errcode = '22023';
  end if;

  insert into public.receipts (
    center_id, student_id, kind, receipt_year, receipt_seq,
    amount_full, discount_applied, amount_paid, period_start, period_end, subjects_covered,
    payment_method, balance_due, student_name, level_name, center_snapshot, issued_by, issued_by_name,
    cancels_receipt_id, cancel_reason
  )
  values (
    v_original.center_id, v_original.student_id, 'cancellation', v_year,
    private.next_receipt_seq(v_original.center_id, v_year),
    -v_original.amount_full, -v_original.discount_applied, -v_original.amount_paid,
    v_original.period_start, v_original.period_end, v_original.subjects_covered,
    v_original.payment_method, 0, v_original.student_name, v_original.level_name, v_original.center_snapshot,
    (select auth.uid()), (select pr.full_name from public.profiles pr where pr.id = (select auth.uid())),
    v_original.id, btrim(p_reason)
  )
  returning * into v_cancel;

  update public.invoices
  set status = case when overdue_from <= private.today() then 'overdue' else 'pending' end::public.invoice_status,
      amount_paid = 0,
      paid_at = null,
      paid_by = null,
      payment_method = null,
      receipt_id = null
  where receipt_id = v_original.id;

  perform private.log_center_event(v_original.center_id, 'receipt.cancelled', v_cancel.id,
    jsonb_build_object('receipt_number', v_original.receipt_number, 'amount', v_original.amount_paid,
                       'reason', btrim(p_reason)));
  return v_cancel;
end;
$function$;

create or replace view public.student_directory
with (security_invoker = true)
as
SELECT s.id,
    s.center_id,
    s.full_name,
    s.search_name,
    s.level_id,
    l.name AS level_name,
    l.sort_order AS level_sort_order,
    s.photo_url,
    s.guardian_name,
    s.guardian_phone,
    s.created_at,
    COALESCE(b.overdue_count, 0) AS overdue_count,
    COALESCE(b.overdue_amount, 0::numeric)::numeric(10,2) AS overdue_amount,
    COALESCE(b.unpaid_amount, 0::numeric)::numeric(10,2) AS unpaid_amount,
    COALESCE(b.overdue_count, 0) > 0 AS is_overdue,
    COALESCE(d.discounts, '[]'::jsonb) AS discounts
   FROM students s
     JOIN levels l ON l.id = s.level_id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE private.invoice_is_overdue(i.status, i.overdue_from))::integer AS overdue_count,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE private.invoice_is_overdue(i.status, i.overdue_from)) AS overdue_amount,
            sum(i.amount_due - i.amount_paid) FILTER (WHERE i.status <> 'paid'::invoice_status) AS unpaid_amount
           FROM invoices i
          WHERE i.student_id = s.id) b ON true
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('type', x.type, 'value', x.value, 'reason', x.reason, 'reason_note', x.reason_note, 'scope', x.scope, 'target', COALESCE(sub.name, p.name)) ORDER BY x.granted_at) AS discounts
           FROM discounts x
             LEFT JOIN subjects sub ON sub.id = x.subject_id
             LEFT JOIN packs p ON p.id = x.pack_id
          WHERE x.student_id = s.id AND x.is_active AND x.valid_from <= private.today() AND (x.valid_to IS NULL OR x.valid_to >= private.today())) d ON true;

create or replace view public.follow_up_queue
with (security_invoker = true)
as
SELECT d.id AS student_id,
    d.center_id,
    d.full_name,
    d.level_name,
    d.photo_url,
    d.guardian_name,
    d.guardian_phone,
    d.overdue_count,
    d.overdue_amount,
    o.oldest_invoice_id,
    o.oldest_due_date,
    private.today() - o.oldest_due_date AS days_overdue,
    f.last_follow_up_at,
    COALESCE((f.last_follow_up_at AT TIME ZONE 'Africa/Casablanca'::text)::date = private.today(), false) AS followed_up_today
   FROM student_directory d
     JOIN LATERAL ( SELECT i.id AS oldest_invoice_id,
            i.due_date AS oldest_due_date
           FROM invoices i
          WHERE i.student_id = d.id AND private.invoice_is_overdue(i.status, i.overdue_from)
          ORDER BY i.due_date, i.period_start
         LIMIT 1) o ON true
     LEFT JOIN LATERAL ( SELECT max(fu.created_at) AS last_follow_up_at
           FROM follow_ups fu
          WHERE fu.student_id = d.id AND fu.type = 'payment'::follow_up_type) f ON true
  WHERE d.is_overdue;

-- ---------------------------------------------------------------------
-- Données des campagnes
-- ---------------------------------------------------------------------
-- Cycle de facturation toujours renseigné : vide, il faisait échouer la
-- préparation de tout le centre.
update public.pack_enrollments set billing_day = private.default_billing_day(student_id, start_date)
where billing_day is null;
update public.enrollments e set billing_day = pe.billing_day
from public.pack_enrollments pe
where e.billing_day is null and pe.id = e.pack_enrollment_id;
update public.enrollments set billing_day = private.default_billing_day(student_id, start_date)
where billing_day is null;
-- Contrainte plutôt que NOT NULL : la valeur par défaut vient d'un déclencheur.
alter table public.enrollments add constraint enrollments_billing_day_set check (billing_day is not null);
alter table public.pack_enrollments add constraint pack_enrollments_billing_day_set check (billing_day is not null);

alter table public.billing_runs alter column total_expected type numeric(14, 2);

alter table public.billing_run_lines
  add column discount_conflict boolean not null default false;

comment on column public.billing_run_lines.discount_conflict is
  'Plusieurs remises s''appliquaient : recopié sur la facture à la confirmation.';

-- ---------------------------------------------------------------------
-- Lignes d'un brouillon : reconstruites depuis les inscriptions actives
-- ---------------------------------------------------------------------
-- Une ligne par inscription (hors pack) ou abonnement pack actif dont la
-- période commence dans le mois de la campagne : tarif convenu, remise du
-- moment, échéance réglée par le centre. Recalculées à la préparation, puis
-- à chaque changement d'inscription, de remise ou de jour d'échéance, tant
-- que la campagne est en brouillon. Pour un élève, ou pour tout le centre.
-- Renvoie le nombre de lignes écrites.
create function private.refresh_billing_run(p_run_id uuid, p_student_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_due_day smallint;
  v_lines integer;
begin
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'draft' then
    return 0;
  end if;
  select c.payment_due_day into v_due_day from public.centers c where c.id = v_run.center_id;

  delete from public.billing_run_lines l
  where l.billing_run_id = p_run_id and (p_student_id is null or l.student_id = p_student_id);

  insert into public.billing_run_lines (
    billing_run_id, center_id, student_id, enrollment_id, pack_enrollment_id, period_start, period_end, due_date,
    amount_full, discount_amount, amount_due, discount_id, discount_snapshot, discount_conflict
  )
  select p_run_id, v_run.center_id, d.student_id, d.enrollment_id, d.pack_enrollment_id, d.period_start, d.period_end,
         d.period_start + (v_due_day - 1), d.amount_full, d.discount_amount, d.amount_due, d.discount_id,
         d.discount_snapshot, d.discount_conflict
  from (
    select e.id as enrollment_id, null::uuid as pack_enrollment_id, e.student_id, e.price_agreed, e.billing_day, e.start_date
    from public.enrollments e
    join public.students st on st.id = e.student_id
    where st.center_id = v_run.center_id and e.active and e.pack_enrollment_id is null
      and (p_student_id is null or e.student_id = p_student_id)
    union all
    select null::uuid, pe.id, pe.student_id, pe.price_agreed, pe.billing_day, pe.start_date
    from public.pack_enrollments pe
    join public.students st on st.id = pe.student_id
    where st.center_id = v_run.center_id and pe.active
      and (p_student_id is null or pe.student_id = p_student_id)
  ) s
  cross join lateral (select make_date(v_run.period_year, v_run.period_month, s.billing_day) as period_start) p
  cross join lateral private.apply_invoice_discount(jsonb_populate_record(null::public.invoices, jsonb_build_object(
    'student_id', s.student_id,
    'enrollment_id', s.enrollment_id,
    'pack_enrollment_id', s.pack_enrollment_id,
    'period_start', p.period_start,
    'period_end', (p.period_start + interval '1 month' - interval '1 day')::date,
    'amount_full', s.price_agreed
  ))) d
  -- Inscription postérieure au début de la période : sa première facture vient de l'inscription.
  where s.start_date <= p.period_start
    -- Période déjà facturée (première facture, reprise, saisie manuelle) : pas de ligne.
    and not exists (
      select 1 from public.invoices i
      where i.period_start = p.period_start
        and (i.enrollment_id = s.enrollment_id or i.pack_enrollment_id = s.pack_enrollment_id)
    );
  get diagnostics v_lines = row_count;

  -- Intentions encore en attente : matières et packs reconduits = lignes de l'élève.
  delete from public.reenrollment_intents ri
  where ri.billing_run_id = p_run_id and ri.intent = 'pending'
    and (p_student_id is null or ri.student_id = p_student_id)
    and not exists (
      select 1 from public.billing_run_lines l where l.billing_run_id = p_run_id and l.student_id = ri.student_id
    );

  insert into public.reenrollment_intents as ri (center_id, billing_run_id, student_id, period_year, period_month, subjects_kept)
  select v_run.center_id, p_run_id, l.student_id, v_run.period_year, v_run.period_month,
         jsonb_agg(jsonb_build_object(
           'kind', case when l.enrollment_id is not null then 'subject' else 'pack' end,
           'enrollment_id', l.enrollment_id,
           'pack_enrollment_id', l.pack_enrollment_id,
           'id', coalesce(e.subject_id, pe.pack_id),
           'name', coalesce(su.name, pk.name)
         ) order by coalesce(su.name, pk.name))
  from public.billing_run_lines l
  left join public.enrollments e on e.id = l.enrollment_id
  left join public.subjects su on su.id = e.subject_id
  left join public.pack_enrollments pe on pe.id = l.pack_enrollment_id
  left join public.packs pk on pk.id = pe.pack_id
  where l.billing_run_id = p_run_id and (p_student_id is null or l.student_id = p_student_id)
  group by l.student_id
  on conflict (billing_run_id, student_id) do update
    set subjects_kept = excluded.subjects_kept
    where ri.intent = 'pending';

  return v_lines;
end;
$$;

-- Totaux d'un brouillon : tenus à jour à chaque écriture de ses lignes,
-- cascades comprises (élève ou inscription supprimés).
create function private.billing_run_lines_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.billing_runs br
  set total_expected = coalesce((select sum(l.amount_due) from public.billing_run_lines l where l.billing_run_id = br.id), 0),
      student_count = (select count(distinct l.student_id)::integer from public.billing_run_lines l where l.billing_run_id = br.id)
  where br.status = 'draft' and br.id in (select c.billing_run_id from changed_lines c);
  return null;
end;
$$;

create trigger billing_run_lines_totals_insert
after insert on public.billing_run_lines
referencing new table as changed_lines
for each statement execute function private.billing_run_lines_totals();

create trigger billing_run_lines_totals_update
after update on public.billing_run_lines
referencing new table as changed_lines
for each statement execute function private.billing_run_lines_totals();

create trigger billing_run_lines_totals_delete
after delete on public.billing_run_lines
referencing old table as changed_lines
for each statement execute function private.billing_run_lines_totals();

-- Brouillons du centre d'un élève : ses lignes recalculées.
create function private.refresh_student_billing_runs(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  for v_run_id in
    select br.id
    from public.billing_runs br
    join public.students st on st.center_id = br.center_id
    where st.id = p_student_id and br.status = 'draft'
    order by br.period_year, br.period_month
  loop
    perform private.refresh_billing_run(v_run_id, p_student_id);
  end loop;
end;
$$;

-- Inscription ou abonnement pack créé, arrêté, repris, modifié ou supprimé :
-- le brouillon suit (les matières d'un pack suivent leur abonnement).
create function private.sync_draft_billing_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and (tg_table_name <> 'enrollments' or (to_jsonb(old) ->> 'pack_enrollment_id') is null) then
    perform private.refresh_student_billing_runs(old.student_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_table_name <> 'enrollments' or (to_jsonb(new) ->> 'pack_enrollment_id') is null) then
    if tg_op = 'INSERT' then
      perform private.refresh_student_billing_runs(new.student_id);
    elsif new.student_id is distinct from old.student_id then
      perform private.refresh_student_billing_runs(new.student_id);
    end if;
  end if;
  return null;
end;
$$;

-- Nommés pour passer après la première facture et la facture de reprise.
create trigger enrollments_sync_billing_runs
after insert or delete or update of active, price_agreed, billing_day, start_date, subject_id, student_id, pack_enrollment_id
on public.enrollments
for each row execute function private.sync_draft_billing_runs();

create trigger pack_enrollments_sync_billing_runs
after insert or delete or update of active, price_agreed, billing_day, start_date, pack_id, student_id
on public.pack_enrollments
for each row execute function private.sync_draft_billing_runs();

-- Jour d'échéance modifié : échéances des brouillons recalculées.
create function private.centers_sync_billing_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  for v_run_id in
    select br.id from public.billing_runs br where br.center_id = new.id and br.status = 'draft'
  loop
    perform private.refresh_billing_run(v_run_id);
  end loop;
  return null;
end;
$$;

create trigger centers_sync_billing_runs
after update of payment_due_day on public.centers
for each row when (new.payment_due_day is distinct from old.payment_due_day)
execute function private.centers_sync_billing_runs();

-- Remise accordée, modifiée ou retirée : factures ouvertes (hors campagne)
-- recalculées, et lignes des brouillons aussi.
create or replace function private.reprice_open_invoices(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_new public.invoices;
  v_count integer := 0;
begin
  for v_invoice in
    select * from public.invoices i
    where i.student_id = p_student_id and i.status <> 'paid' and i.amount_paid = 0 and i.billing_run_id is null
    for update
  loop
    v_new := private.apply_invoice_discount(v_invoice);
    if (v_new.discount_id, v_new.discount_amount, v_new.discount_conflict)
       is distinct from (v_invoice.discount_id, v_invoice.discount_amount, v_invoice.discount_conflict) then
      update public.invoices
      set discount_id = v_new.discount_id,
          discount_amount = v_new.discount_amount,
          discount_snapshot = v_new.discount_snapshot,
          discount_conflict = v_new.discount_conflict,
          amount_due = v_new.amount_due
      where id = v_invoice.id;
      v_count := v_count + 1;
    end if;
  end loop;
  perform private.refresh_student_billing_runs(p_student_id);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Préparation d'une campagne
-- ---------------------------------------------------------------------
-- Prépare le brouillon du mois donné pour un centre ; rien si une campagne
-- existe déjà pour ce mois (quel que soit son statut). Renvoie son identifiant.
create function private.generate_billing_run(
  p_center_id uuid,
  p_year smallint,
  p_month smallint,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_lines integer;
begin
  if not exists (select 1 from public.centers c where c.id = p_center_id) then
    return null;
  end if;

  insert into public.billing_runs (center_id, period_year, period_month, generated_by)
  values (p_center_id, p_year, p_month, p_actor)
  on conflict (center_id, period_year, period_month) do nothing
  returning * into v_run;
  if v_run.id is null then
    return null;
  end if;

  v_lines := private.refresh_billing_run(v_run.id);
  select * into v_run from public.billing_runs br where br.id = v_run.id;

  perform private.log_center_event(p_center_id, 'billing_run.generated', v_run.id,
    jsonb_build_object('year', p_year, 'month', p_month, 'lines', v_lines, 'students', v_run.student_count,
                       'total_expected', v_run.total_expected, 'automatic', p_actor is null));
  return v_run.id;
end;
$$;

-- Job quotidien : campagne du mois suivant, dès le jour de préparation de
-- chaque centre. Un centre en échec ne bloque pas les autres : l'échec est
-- consigné dans son journal, et la préparation retentée la nuit suivante.
create function private.generate_billing_runs(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target date := (date_trunc('month', p_date) + interval '1 month')::date;
  v_year smallint := extract(year from v_target)::smallint;
  v_month smallint := extract(month from v_target)::smallint;
  v_center_id uuid;
  v_created integer := 0;
  v_state text;
  v_message text;
begin
  for v_center_id in
    select c.id from public.centers c
    where c.auto_reenrollment_enabled
      and c.status in ('trial', 'active', 'past_due')
      and extract(day from p_date) >= c.billing_generation_day
      and not exists (
        select 1 from public.billing_runs br
        where br.center_id = c.id and br.period_year = v_year and br.period_month = v_month
      )
  loop
    begin
      if private.generate_billing_run(v_center_id, v_year, v_month) is not null then
        v_created := v_created + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      perform private.log_center_event(v_center_id, 'billing_run.failed', null,
        jsonb_build_object('year', v_year, 'month', v_month, 'sqlstate', v_state, 'message', left(v_message, 300)));
    end;
  end loop;
  return v_created;
end;
$$;

-- ---------------------------------------------------------------------
-- Facturation : ce que la campagne couvre n'est facturé ni chaque nuit, ni à
-- la reprise d'une inscription, ni à l'inscription (mois sans cours)
-- ---------------------------------------------------------------------
create function private.campaign_covers(
  p_center_id uuid,
  p_period_start date,
  p_enrollment_id uuid,
  p_pack_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.billing_runs br
    join public.centers c on c.id = br.center_id and c.auto_reenrollment_enabled
    where br.center_id = p_center_id
      and br.period_year = extract(year from p_period_start)
      and br.period_month = extract(month from p_period_start)
      and (
        br.status = 'cancelled'
        or exists (
          select 1 from public.billing_run_lines l
          where l.billing_run_id = br.id
            and (l.enrollment_id = p_enrollment_id or l.pack_enrollment_id = p_pack_enrollment_id)
        )
      )
  );
$$;

create or replace function private.create_period_invoice(p_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if v_enrollment.id is null or not v_enrollment.active or v_enrollment.start_date > p_date
     or v_enrollment.pack_enrollment_id is not null then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_enrollment.billing_day);
  if private.campaign_covers(private.student_center_id(v_enrollment.student_id), v_period_start, v_enrollment.id, null) then
    return false;
  end if;

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_enrollment.id,
    v_enrollment.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_enrollment.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function private.create_pack_period_invoice(p_pack_enrollment_id uuid, p_date date, p_resumed boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.pack_enrollments;
  v_period_start date;
  v_inserted integer;
begin
  select * into v_subscription from public.pack_enrollments where id = p_pack_enrollment_id;
  if v_subscription.id is null or not v_subscription.active or v_subscription.start_date > p_date then
    return false;
  end if;

  v_period_start := private.billing_period_start(p_date, v_subscription.billing_day);
  if private.campaign_covers(private.student_center_id(v_subscription.student_id), v_period_start, null, v_subscription.id) then
    return false;
  end if;

  insert into public.invoices (pack_enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    v_subscription.id,
    v_subscription.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    v_subscription.price_agreed,
    'pending',
    case when p_resumed then greatest(v_period_start, p_date) else v_period_start end
  )
  on conflict (pack_enrollment_id, period_start) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function private.enrollments_create_first_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := private.billing_period_start(new.start_date, new.billing_day);
begin
  if new.pack_enrollment_id is not null
     or private.campaign_covers(private.student_center_id(new.student_id), v_period_start, new.id, null) then
    return null;
  end if;

  insert into public.invoices (enrollment_id, student_id, period_start, period_end, amount_due, status, due_date)
  values (
    new.id,
    new.student_id,
    v_period_start,
    (v_period_start + interval '1 month' - interval '1 day')::date,
    new.price_agreed,
    'pending',
    new.start_date
  )
  on conflict (enrollment_id, period_start) do nothing;
  return null;
end;
$$;

-- Campagnes en dernier : un échec n'empêche ni la facturation, ni les
-- retards, ni le suivi des abonnements des centres.
create or replace function private.run_daily_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoices integer := private.generate_invoices();
  v_overdue integer := private.mark_overdue_invoices();
  v_centers jsonb := private.update_center_statuses();
  v_notifications integer := private.queue_platform_notifications(private.today(), v_centers);
  v_runs integer := 0;
begin
  begin
    v_runs := private.generate_billing_runs();
  exception when others then
    raise warning 'Préparation des campagnes interrompue : %', sqlerrm;
  end;
  return jsonb_build_object(
    'billing_runs_created', v_runs,
    'invoices_created', v_invoices,
    'invoices_overdue', v_overdue,
    'centers', v_centers,
    'notifications_queued', v_notifications);
end;
$$;

-- ---------------------------------------------------------------------
-- Préparer maintenant (admin) : le brouillon du mois prochain, sans attendre la nuit
-- ---------------------------------------------------------------------
create function public.prepare_billing_run()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := (select private.auth_center_id());
  v_target date := (date_trunc('month', private.today()) + interval '1 month')::date;
  v_run_id uuid;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.can_read_finance(v_center_id)) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.centers c where c.id = v_center_id and c.auto_reenrollment_enabled) then
    raise exception 'Activez d''abord la réinscription automatique dans les réglages.' using errcode = '22023';
  end if;
  select br.id into v_run_id from public.billing_runs br
  where br.center_id = v_center_id
    and br.period_year = extract(year from v_target) and br.period_month = extract(month from v_target);
  if v_run_id is not null then
    return v_run_id;
  end if;
  return private.generate_billing_run(v_center_id, extract(year from v_target)::smallint,
                                      extract(month from v_target)::smallint, (select auth.uid()));
end;
$$;

revoke all on function private.generate_billing_run(uuid, smallint, smallint, uuid),
  private.generate_billing_runs(date),
  private.campaign_covers(uuid, date, uuid, uuid),
  private.refresh_billing_run(uuid, uuid),
  private.refresh_student_billing_runs(uuid),
  private.billing_run_lines_totals(),
  private.sync_draft_billing_runs(),
  private.centers_sync_billing_runs()
from public, anon, authenticated;
revoke all on function public.prepare_billing_run() from public, anon;
grant execute on function public.prepare_billing_run() to authenticated;
