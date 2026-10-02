-- =====================================================================
-- CentroManager — 036 : revue et confirmation des campagnes
-- (page 8, phase 3)
--
--  * Revue : par élève, ses matières et packs du mois (tarif plein, remise,
--    net), son intention (reconduit, abandonne, en pause, matières retirées)
--    et ses signaux de risque : impayé en retard d'avant le mois de la
--    campagne, présence sous le seuil du centre sur les 30 derniers jours.
--  * L'accueil et l'admin décident des intentions ; seul l'admin confirme.
--  * La confirmation recalcule une dernière fois le brouillon, vaut
--    « reconduit » pour les élèves sans décision, puis émet une facture par
--    ligne conservée, au montant figé. L'admin peut aussi déclarer le mois
--    sans cours : aucune facture ce mois-là.
--  * Abandons, pauses et matières retirées s'appliquent au début de chaque
--    période (job quotidien, avant la facturation) ; une reprise ultérieure
--    se facture normalement.
--  * Une campagne se clôt d'elle-même le lendemain de sa dernière période.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lignes conservées : ni élève qui abandonne ou fait une pause, ni matière retirée
-- ---------------------------------------------------------------------
create function private.billing_line_dropped(p_dropped jsonb, p_enrollment_id uuid, p_pack_enrollment_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_dropped @> jsonb_build_array(
    case when p_enrollment_id is not null then jsonb_build_object('enrollment_id', p_enrollment_id)
         else jsonb_build_object('pack_enrollment_id', p_pack_enrollment_id) end
  ), false);
$$;

create function private.billing_run_kept_lines(p_run_id uuid)
returns setof public.billing_run_lines
language sql
stable
security definer
set search_path = ''
as $$
  select l.*
  from public.billing_run_lines l
  left join public.reenrollment_intents ri on ri.billing_run_id = l.billing_run_id and ri.student_id = l.student_id
  where l.billing_run_id = p_run_id
    and coalesce(ri.intent, 'pending') not in ('dropped', 'paused')
    and not private.billing_line_dropped(ri.subjects_dropped, l.enrollment_id, l.pack_enrollment_id);
$$;

-- Prévisionnel d'un brouillon : lignes conservées seulement.
create function private.refresh_billing_run_totals(p_run_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.billing_runs br
  set total_expected = coalesce(k.total, 0),
      student_count = coalesce(k.students, 0)
  from (
    select sum(kl.amount_due) as total, count(distinct kl.student_id)::integer as students
    from private.billing_run_kept_lines(p_run_id) kl
  ) k
  where br.id = p_run_id and br.status = 'draft';
$$;

create or replace function private.billing_run_lines_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  for v_run_id in select distinct c.billing_run_id from changed_lines c loop
    perform private.refresh_billing_run_totals(v_run_id);
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Brouillon : les décisions survivent au recalcul des lignes
-- ---------------------------------------------------------------------
create or replace function private.refresh_billing_run(p_run_id uuid, p_student_id uuid default null)
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

  -- Sans ligne ni décision : plus d'intention.
  delete from public.reenrollment_intents ri
  where ri.billing_run_id = p_run_id and ri.intent = 'pending'
    and (p_student_id is null or ri.student_id = p_student_id)
    and not exists (
      select 1 from public.billing_run_lines l where l.billing_run_id = p_run_id and l.student_id = ri.student_id
    );

  -- Une intention par élève : matières et packs reconduits ou retirés, recalculés
  -- depuis ses lignes ; la décision déjà prise (abandon, pause, matière retirée) est gardée.
  with items as (
    select l.student_id, l.enrollment_id, l.pack_enrollment_id,
           coalesce(su.name, pk.name) as name,
           jsonb_build_object(
             'kind', case when l.enrollment_id is not null then 'subject' else 'pack' end,
             'enrollment_id', l.enrollment_id,
             'pack_enrollment_id', l.pack_enrollment_id,
             'id', coalesce(e.subject_id, pe.pack_id),
             'name', coalesce(su.name, pk.name)
           ) as item
    from public.billing_run_lines l
    left join public.enrollments e on e.id = l.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = l.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    where l.billing_run_id = p_run_id and (p_student_id is null or l.student_id = p_student_id)
  ),
  per_student as (
    select i.student_id,
           coalesce(jsonb_agg(i.item order by i.name) filter (where not d.dropped), '[]'::jsonb) as kept,
           coalesce(jsonb_agg(i.item order by i.name) filter (where d.dropped), '[]'::jsonb) as dropped
    from items i
    left join public.reenrollment_intents ri on ri.billing_run_id = p_run_id and ri.student_id = i.student_id
    cross join lateral (
      select coalesce(ri.intent in ('dropped', 'paused'), false)
             or private.billing_line_dropped(ri.subjects_dropped, i.enrollment_id, i.pack_enrollment_id) as dropped
    ) d
    group by i.student_id
  )
  insert into public.reenrollment_intents as ri (center_id, billing_run_id, student_id, period_year, period_month,
                                                 subjects_kept, subjects_dropped)
  select v_run.center_id, p_run_id, ps.student_id, v_run.period_year, v_run.period_month, ps.kept, ps.dropped
  from per_student ps
  on conflict (billing_run_id, student_id) do update
    set subjects_kept = excluded.subjects_kept,
        subjects_dropped = excluded.subjects_dropped;

  perform private.refresh_billing_run_totals(p_run_id);
  return v_lines;
end;
$$;

-- ---------------------------------------------------------------------
-- Revue d'une campagne (accueil et admin)
-- ---------------------------------------------------------------------
create function public.billing_run_review(p_run_id uuid)
returns table (
  student_id uuid,
  full_name text,
  photo_url text,
  level_name text,
  guardian_name text,
  guardian_phone text,
  intent public.reenrollment_intent,
  reason text,
  decided_at timestamptz,
  decided_by_name text,
  applied_at timestamptz,
  lines jsonb,
  amount_full numeric,
  discount_amount numeric,
  amount_due numeric,
  overdue_amount numeric,
  overdue_invoices integer,
  attendance_rate numeric,
  attendance_count integer,
  low_attendance boolean,
  at_risk boolean
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.billing_runs;
  v_threshold smallint;
  v_month_start date;
  v_today date := private.today();
begin
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  -- Campagne d'un autre centre : invisible (RLS), donc rien.
  select * into v_run from public.billing_runs br where br.id = p_run_id;
  if v_run.id is null then
    return;
  end if;
  select c.risk_attendance_threshold into v_threshold from public.centers c where c.id = v_run.center_id;
  v_month_start := make_date(v_run.period_year, v_run.period_month, 1);

  return query
  with intents as (
    select ri.* from public.reenrollment_intents ri where ri.billing_run_id = p_run_id
  ),
  line_items as (
    select l.student_id,
           jsonb_agg(jsonb_build_object(
             'line_id', l.id,
             'kind', case when l.enrollment_id is not null then 'subject' else 'pack' end,
             'source_id', coalesce(l.enrollment_id, l.pack_enrollment_id),
             'name', coalesce(su.name, pk.name),
             'period_start', l.period_start,
             'due_date', l.due_date,
             'amount_full', l.amount_full,
             'discount_amount', l.discount_amount,
             'amount_due', l.amount_due,
             'discount_conflict', l.discount_conflict,
             'kept', k.kept,
             'invoice_id', l.invoice_id,
             'invoice_status', inv.status,
             'amount_paid', inv.amount_paid,
             'overdue_from', inv.overdue_from
           ) order by coalesce(su.name, pk.name)) as lines,
           sum(l.amount_full) filter (where k.kept) as amount_full,
           sum(l.discount_amount) filter (where k.kept) as discount_amount,
           sum(l.amount_due) filter (where k.kept) as amount_due
    from public.billing_run_lines l
    left join intents ri on ri.student_id = l.student_id
    left join public.enrollments e on e.id = l.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = l.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    left join public.invoices inv on inv.id = l.invoice_id
    cross join lateral (
      select coalesce(ri.intent, 'pending') not in ('dropped', 'paused')
             and not private.billing_line_dropped(ri.subjects_dropped, l.enrollment_id, l.pack_enrollment_id) as kept
    ) k
    where l.billing_run_id = p_run_id
    group by l.student_id
  ),
  overdue as (
    select i.student_id, sum(i.amount_due - i.amount_paid) as amount, count(*)::integer as invoices
    from public.invoices i
    where i.student_id in (select it.student_id from intents it)
      and i.status <> 'paid' and i.overdue_from <= v_today and i.period_start < v_month_start
    group by i.student_id
  ),
  presence as (
    select a.student_id,
           round((count(*) filter (where a.status = 'present'))::numeric / count(*), 4) as rate,
           count(*)::integer as sessions
    from public.attendance a
    where a.student_id in (select it.student_id from intents it)
      and a.session_date > v_today - 30 and a.session_date <= v_today
    group by a.student_id
  )
  select it.student_id,
         st.full_name,
         st.photo_url,
         lv.name,
         st.guardian_name,
         st.guardian_phone,
         it.intent,
         it.reason,
         it.decided_at,
         dp.full_name,
         it.applied_at,
         coalesce(li.lines, '[]'::jsonb),
         coalesce(li.amount_full, 0),
         coalesce(li.discount_amount, 0),
         coalesce(li.amount_due, 0),
         coalesce(od.amount, 0),
         coalesce(od.invoices, 0),
         pr.rate,
         coalesce(pr.sessions, 0),
         coalesce(pr.sessions > 0 and pr.rate * 100 < v_threshold, false),
         coalesce(od.amount, 0) > 0 or coalesce(pr.sessions > 0 and pr.rate * 100 < v_threshold, false)
  from intents it
  join public.students st on st.id = it.student_id
  left join public.levels lv on lv.id = st.level_id
  left join public.profiles dp on dp.id = it.decided_by
  left join line_items li on li.student_id = it.student_id
  left join overdue od on od.student_id = it.student_id
  left join presence pr on pr.student_id = it.student_id
  order by 21 desc, st.full_name;
end;
$$;

comment on function public.billing_run_review(uuid) is
  'Revue d''une campagne : une ligne par élève, ses lignes, son intention et ses signaux de risque.';

-- ---------------------------------------------------------------------
-- Intention d'un élève (accueil et admin, campagne en brouillon)
-- ---------------------------------------------------------------------
-- p_dropped_sources : inscriptions ou abonnements pack retirés (élève reconduit).
create function public.set_reenrollment_intent(
  p_run_id uuid,
  p_student_id uuid,
  p_intent public.reenrollment_intent,
  p_dropped_sources uuid[] default '{}',
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_kept jsonb;
  v_dropped jsonb;
  v_lines integer;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or not (select private.is_staff())
     or v_run.center_id is distinct from (select private.auth_center_id()) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Campagne confirmée : les intentions ne changent plus.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.reenrollment_intents ri where ri.billing_run_id = p_run_id and ri.student_id = p_student_id
  ) then
    raise exception 'Cet élève ne fait pas partie de la campagne.' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 300 then
    raise exception 'Motif : 300 caractères au plus.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(s.item order by s.name) filter (where not s.dropped), '[]'::jsonb),
         coalesce(jsonb_agg(s.item order by s.name) filter (where s.dropped), '[]'::jsonb),
         count(*)::integer
  into v_kept, v_dropped, v_lines
  from (
    select coalesce(su.name, pk.name) as name,
           jsonb_build_object(
             'kind', case when l.enrollment_id is not null then 'subject' else 'pack' end,
             'enrollment_id', l.enrollment_id,
             'pack_enrollment_id', l.pack_enrollment_id,
             'id', coalesce(e.subject_id, pe.pack_id),
             'name', coalesce(su.name, pk.name)
           ) as item,
           p_intent in ('dropped', 'paused')
             or (p_intent = 'confirmed' and coalesce(l.enrollment_id, l.pack_enrollment_id) = any(coalesce(p_dropped_sources, '{}'))) as dropped
    from public.billing_run_lines l
    left join public.enrollments e on e.id = l.enrollment_id
    left join public.subjects su on su.id = e.subject_id
    left join public.pack_enrollments pe on pe.id = l.pack_enrollment_id
    left join public.packs pk on pk.id = pe.pack_id
    where l.billing_run_id = p_run_id and l.student_id = p_student_id
  ) s;

  if p_intent = 'confirmed' and v_lines > 0 and v_kept = '[]'::jsonb then
    raise exception 'Toutes les matières sont retirées : choisissez « abandonne » ou « en pause ».' using errcode = '22023';
  end if;

  update public.reenrollment_intents ri
  set intent = p_intent,
      subjects_kept = v_kept,
      subjects_dropped = v_dropped,
      decided_at = case when p_intent = 'pending' then null else now() end,
      decided_by = case when p_intent = 'pending' then null else (select auth.uid()) end,
      reason = case when p_intent = 'pending' then null else v_reason end
  where ri.billing_run_id = p_run_id and ri.student_id = p_student_id;

  perform private.refresh_billing_run_totals(p_run_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Confirmation (admin) : les factures sont émises, leurs montants figés
-- ---------------------------------------------------------------------
create function public.confirm_billing_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_actor uuid := (select auth.uid());
  v_invoices integer;
  v_total numeric(14, 2);
  v_students integer;
  v_summary jsonb;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or not (select private.can_read_finance(v_run.center_id)) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Cette campagne n''est plus en brouillon.' using errcode = '22023';
  end if;

  -- Dernier recalcul : inscriptions, remises et échéances du moment.
  perform private.refresh_billing_run(p_run_id);

  -- Sans décision : reconduit.
  update public.reenrollment_intents ri
  set intent = 'confirmed', decided_at = now(), decided_by = v_actor
  where ri.billing_run_id = p_run_id and ri.intent = 'pending';

  with issued as (
    insert into public.invoices (
      enrollment_id, pack_enrollment_id, student_id, period_start, period_end, due_date,
      amount_full, discount_amount, amount_due, discount_id, discount_snapshot, discount_conflict,
      status, billing_run_id
    )
    select k.enrollment_id, k.pack_enrollment_id, k.student_id, k.period_start, k.period_end, k.due_date,
           k.amount_full, k.discount_amount, k.amount_due, k.discount_id, k.discount_snapshot, k.discount_conflict,
           'pending', p_run_id
    from private.billing_run_kept_lines(p_run_id) k
    on conflict do nothing
    returning id, enrollment_id, pack_enrollment_id
  )
  update public.billing_run_lines l
  set invoice_id = i.id
  from issued i
  where l.billing_run_id = p_run_id
    and (l.enrollment_id = i.enrollment_id or l.pack_enrollment_id = i.pack_enrollment_id);

  select count(*)::integer, coalesce(sum(i.amount_due), 0), count(distinct i.student_id)::integer
  into v_invoices, v_total, v_students
  from public.invoices i where i.billing_run_id = p_run_id;

  update public.billing_runs br
  set status = 'confirmed', confirmed_at = now(), confirmed_by = v_actor,
      total_expected = v_total, student_count = v_students
  where br.id = p_run_id;

  select jsonb_build_object(
           'invoices', v_invoices,
           'students', v_students,
           'total_expected', v_total,
           'confirmed', count(*) filter (where ri.intent = 'confirmed'),
           'dropped', count(*) filter (where ri.intent = 'dropped'),
           'paused', count(*) filter (where ri.intent = 'paused'),
           'subjects_dropped', count(*) filter (where ri.intent = 'confirmed' and jsonb_array_length(ri.subjects_dropped) > 0)
         )
  into v_summary
  from public.reenrollment_intents ri where ri.billing_run_id = p_run_id;

  perform private.log_center_event(v_run.center_id, 'billing_run.confirmed', p_run_id,
    v_summary || jsonb_build_object('year', v_run.period_year, 'month', v_run.period_month));

  -- Période déjà commencée (confirmation tardive) : abandons et pauses appliqués tout de suite.
  perform private.apply_reenrollment_intents(private.today(), p_run_id);
  return v_summary;
end;
$$;

-- ---------------------------------------------------------------------
-- Mois sans cours (admin) : le brouillon est écarté, rien n'est facturé ce mois-là
-- ---------------------------------------------------------------------
create function public.cancel_billing_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.id is null or not (select private.can_read_finance(v_run.center_id)) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Cette campagne n''est plus en brouillon.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 300 then
    raise exception 'Indiquez le motif (300 caractères au plus).' using errcode = '22023';
  end if;

  update public.billing_runs br
  set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason
  where br.id = p_run_id;

  perform private.log_center_event(v_run.center_id, 'billing_run.cancelled', p_run_id,
    jsonb_build_object('year', v_run.period_year, 'month', v_run.period_month, 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------------
-- Abandons, pauses et matières retirées : appliqués au début de chaque période
-- ---------------------------------------------------------------------
-- Chaque inscription ou abonnement retiré s'arrête le premier jour de sa
-- période dans la campagne (le 1er ou le 15) ; l'intention est appliquée
-- quand tout ce qu'elle retire est arrêté. Un élève en échec ne bloque pas
-- les autres.
create function private.apply_reenrollment_intents(p_date date default private.today(), p_run_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent record;
  v_item jsonb;
  v_period_start date;
  v_waiting boolean;
  v_applied integer := 0;
  v_state text;
  v_message text;
begin
  for v_intent in
    select ri.id, ri.center_id, ri.billing_run_id, ri.student_id, ri.intent, ri.subjects_dropped
    from public.reenrollment_intents ri
    join public.billing_runs br on br.id = ri.billing_run_id
    where br.status in ('confirmed', 'sent', 'closed')
      and ri.applied_at is null
      and jsonb_array_length(ri.subjects_dropped) > 0
      and make_date(br.period_year, br.period_month, 1) <= p_date
      and (p_run_id is null or ri.billing_run_id = p_run_id)
  loop
    begin
      v_waiting := false;
      for v_item in select value from jsonb_array_elements(v_intent.subjects_dropped) loop
        select l.period_start into v_period_start
        from public.billing_run_lines l
        where l.billing_run_id = v_intent.billing_run_id
          and (l.enrollment_id = (v_item ->> 'enrollment_id')::uuid
               or l.pack_enrollment_id = (v_item ->> 'pack_enrollment_id')::uuid);
        if v_period_start is not null and v_period_start > p_date then
          v_waiting := true;
        elsif v_item ->> 'enrollment_id' is not null then
          update public.enrollments e set active = false
          where e.id = (v_item ->> 'enrollment_id')::uuid and e.active;
        else
          update public.pack_enrollments pe set active = false
          where pe.id = (v_item ->> 'pack_enrollment_id')::uuid and pe.active;
        end if;
      end loop;
      if not v_waiting then
        update public.reenrollment_intents ri set applied_at = now() where ri.id = v_intent.id;
        perform private.log_center_event(v_intent.center_id, 'reenrollment.applied', v_intent.student_id,
          jsonb_build_object('billing_run_id', v_intent.billing_run_id, 'intent', v_intent.intent,
                             'sources', v_intent.subjects_dropped));
        v_applied := v_applied + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      perform private.log_center_event(v_intent.center_id, 'reenrollment.apply_failed', v_intent.student_id,
        jsonb_build_object('billing_run_id', v_intent.billing_run_id, 'sqlstate', v_state, 'message', left(v_message, 300)));
    end;
  end loop;
  return v_applied;
end;
$$;

-- Campagne dont toutes les périodes sont finies : close.
create function private.close_billing_runs(p_date date default private.today())
returns integer
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.billing_runs br
    set status = 'closed', closed_at = now()
    where br.status in ('confirmed', 'sent')
      and make_date(br.period_year, br.period_month, 1) < p_date
      and not exists (
        select 1 from public.billing_run_lines l where l.billing_run_id = br.id and l.period_end >= p_date
      )
    returning br.id
  )
  select count(*)::integer from closed;
$$;

-- ---------------------------------------------------------------------
-- Couverture : une ligne retirée et appliquée ne couvre plus sa source
-- ---------------------------------------------------------------------
-- Après un abandon ou une pause appliqués, la reprise d'une inscription se
-- facture normalement ; avant, la campagne couvre la période (rien en double).
create or replace function private.campaign_covers(
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
          select 1
          from public.billing_run_lines l
          left join public.reenrollment_intents ri on ri.billing_run_id = l.billing_run_id and ri.student_id = l.student_id
          where l.billing_run_id = br.id
            and (l.enrollment_id = p_enrollment_id or l.pack_enrollment_id = p_pack_enrollment_id)
            and (br.status = 'draft' or l.invoice_id is not null or ri.applied_at is null)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------
-- Job quotidien : intentions d'abord (avant la facturation), campagnes ensuite
-- ---------------------------------------------------------------------
create or replace function private.run_daily_automations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_applied integer := 0;
  v_invoices integer;
  v_overdue integer;
  v_centers jsonb;
  v_notifications integer;
  v_runs integer := 0;
  v_closed integer := 0;
begin
  begin
    v_applied := private.apply_reenrollment_intents();
  exception when others then
    raise warning 'Application des intentions interrompue : %', sqlerrm;
  end;
  v_invoices := private.generate_invoices();
  v_overdue := private.mark_overdue_invoices();
  v_centers := private.update_center_statuses();
  v_notifications := private.queue_platform_notifications(private.today(), v_centers);
  begin
    v_runs := private.generate_billing_runs();
  exception when others then
    raise warning 'Préparation des campagnes interrompue : %', sqlerrm;
  end;
  begin
    v_closed := private.close_billing_runs();
  exception when others then
    raise warning 'Clôture des campagnes interrompue : %', sqlerrm;
  end;
  return jsonb_build_object(
    'reenrollment_intents_applied', v_applied,
    'invoices_created', v_invoices,
    'invoices_overdue', v_overdue,
    'centers', v_centers,
    'notifications_queued', v_notifications,
    'billing_runs_created', v_runs,
    'billing_runs_closed', v_closed);
end;
$$;

revoke all on function private.billing_line_dropped(jsonb, uuid, uuid),
  private.billing_run_kept_lines(uuid),
  private.refresh_billing_run_totals(uuid),
  private.apply_reenrollment_intents(date, uuid),
  private.close_billing_runs(date)
from public, anon, authenticated;
-- Calcul pur, lu par la revue (qui s'exécute avec les droits de l'utilisateur).
grant execute on function private.billing_line_dropped(jsonb, uuid, uuid) to authenticated;
revoke all on function public.billing_run_review(uuid),
  public.set_reenrollment_intent(uuid, uuid, public.reenrollment_intent, uuid[], text),
  public.confirm_billing_run(uuid),
  public.cancel_billing_run(uuid, text)
from public, anon;
grant execute on function public.billing_run_review(uuid),
  public.set_reenrollment_intent(uuid, uuid, public.reenrollment_intent, uuid[], text),
  public.confirm_billing_run(uuid),
  public.cancel_billing_run(uuid, text)
to authenticated;
