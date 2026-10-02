-- =====================================================================
-- CentroManager — 038 : campagnes, corrections de la revue (page 8, phase 3)
--
--  * L'arrêt des matières retirées (abandon, pause, matière retirée) est
--    suivi ligne par ligne (billing_run_lines.stopped_at) : une matière du
--    cycle du 1er arrêtée le 1er et reprise ensuite se facture normalement,
--    et n'est plus arrêtée une seconde fois le 15 avec celles du cycle du 15.
--  * Une matière retirée reste retirée si elle est arrêtée puis reprise
--    pendant le brouillon (la décision ne dépend plus de la présence de sa
--    ligne).
--  * Le brouillon d'un mois suivant n'inclut pas une matière retirée d'une
--    campagne précédente et pas encore arrêtée (cycle du 15) ; confirmer une
--    campagne met à jour les brouillons suivants.
--  * Mois sans cours : prévisionnel remis à zéro.
--  * Les fonctions des campagnes vérifient le rôle et le centre avant de
--    verrouiller la campagne.
-- =====================================================================

alter table public.billing_run_lines add column stopped_at timestamptz;

comment on column public.billing_run_lines.stopped_at is
  'Ligne retirée (abandon, pause, matière retirée) : arrêt de son inscription au début de sa période.';

-- La date d'arrêt se pose aussi sur une campagne confirmée.
create or replace function private.billing_run_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status public.billing_run_status;
  v_new_status public.billing_run_status;
  v_free text[] := case tg_table_name
    when 'billing_run_lines' then array['invoice_id', 'discount_id', 'stopped_at']
    else array['applied_at', 'decided_by']
  end;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select br.status into v_old_status from public.billing_runs br where br.id = old.billing_run_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select br.status into v_new_status from public.billing_runs br where br.id = new.billing_run_id;
  end if;

  if tg_op = 'INSERT' then
    if v_new_status is not null and v_new_status <> 'draft' then
      raise exception 'Campagne confirmée : aucune ligne ne s''y ajoute.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_status is null or v_old_status = 'draft'
       or not exists (select 1 from public.students st where st.id = old.student_id)
       or (tg_table_name = 'billing_run_lines' and not exists (
             select 1 from public.enrollments e where e.id = (to_jsonb(old) ->> 'enrollment_id')::uuid
             union all
             select 1 from public.pack_enrollments pe where pe.id = (to_jsonb(old) ->> 'pack_enrollment_id')::uuid)) then
      return old;
    end if;
    raise exception 'Campagne confirmée : ses lignes ne se suppriment pas.' using errcode = '42501';
  end if;

  if new.billing_run_id is distinct from old.billing_run_id
     and (coalesce(v_old_status, 'draft') <> 'draft' or coalesce(v_new_status, 'draft') <> 'draft') then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  if v_old_status is not null and v_old_status <> 'draft'
     and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Brouillon : décisions gardées, retraits en attente d'une campagne précédente exclus
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
    )
    -- Retirée d'une campagne précédente et pas encore arrêtée (cycle du 15) : elle part.
    and not exists (
      select 1
      from public.billing_run_lines ol
      join public.billing_runs ob on ob.id = ol.billing_run_id
      left join public.reenrollment_intents oi on oi.billing_run_id = ol.billing_run_id and oi.student_id = ol.student_id
      where ob.center_id = v_run.center_id
        and ob.status in ('confirmed', 'sent', 'closed')
        and (ob.period_year, ob.period_month) < (v_run.period_year, v_run.period_month)
        and ol.stopped_at is null
        and (ol.enrollment_id = s.enrollment_id or ol.pack_enrollment_id = s.pack_enrollment_id)
        and (coalesce(oi.intent, 'pending') in ('dropped', 'paused')
             or private.billing_line_dropped(oi.subjects_dropped, ol.enrollment_id, ol.pack_enrollment_id))
    );
  get diagnostics v_lines = row_count;

  -- Sans ligne ni décision : plus d'intention.
  delete from public.reenrollment_intents ri
  where ri.billing_run_id = p_run_id and ri.intent = 'pending'
    and (p_student_id is null or ri.student_id = p_student_id)
    and not exists (
      select 1 from public.billing_run_lines l where l.billing_run_id = p_run_id and l.student_id = ri.student_id
    );

  -- Une intention par élève : matières et packs reconduits ou retirés. La
  -- décision prise est gardée, y compris pour une matière retirée dont la
  -- ligne a disparu (arrêtée pendant le brouillon) : reprise, elle reste retirée.
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
  ),
  preserved as (
    select ri.student_id, jsonb_agg(x.item) as items
    from public.reenrollment_intents ri
    cross join lateral jsonb_array_elements(ri.subjects_dropped) as x(item)
    where ri.billing_run_id = p_run_id and (p_student_id is null or ri.student_id = p_student_id)
      and not exists (
        select 1 from public.billing_run_lines l
        where l.billing_run_id = p_run_id and l.student_id = ri.student_id
          and (l.enrollment_id = (x.item ->> 'enrollment_id')::uuid
               or l.pack_enrollment_id = (x.item ->> 'pack_enrollment_id')::uuid)
      )
    group by ri.student_id
  )
  insert into public.reenrollment_intents as ri (center_id, billing_run_id, student_id, period_year, period_month,
                                                 subjects_kept, subjects_dropped)
  select v_run.center_id, p_run_id, ps.student_id, v_run.period_year, v_run.period_month, ps.kept,
         ps.dropped || coalesce(pr.items, '[]'::jsonb)
  from per_student ps
  left join preserved pr on pr.student_id = ps.student_id
  on conflict (billing_run_id, student_id) do update
    set subjects_kept = excluded.subjects_kept,
        subjects_dropped = excluded.subjects_dropped;

  perform private.refresh_billing_run_totals(p_run_id);
  return v_lines;
end;
$$;

-- ---------------------------------------------------------------------
-- Arrêt ligne par ligne, au début de sa période
-- ---------------------------------------------------------------------
-- Une ligne retirée s'arrête une seule fois : reprise ensuite, son
-- inscription n'est plus touchée. Une matière retirée sans ligne (déjà
-- arrêtée à la confirmation) n'a rien à arrêter.
create or replace function private.apply_reenrollment_intents(p_date date default private.today(), p_run_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent record;
  v_line record;
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
      for v_line in
        select l.id, l.enrollment_id, l.pack_enrollment_id
        from public.billing_run_lines l
        where l.billing_run_id = v_intent.billing_run_id and l.student_id = v_intent.student_id
          and l.stopped_at is null and l.period_start <= p_date
          and (v_intent.intent in ('dropped', 'paused')
               or private.billing_line_dropped(v_intent.subjects_dropped, l.enrollment_id, l.pack_enrollment_id))
      loop
        if v_line.enrollment_id is not null then
          update public.enrollments e set active = false where e.id = v_line.enrollment_id and e.active;
        else
          update public.pack_enrollments pe set active = false where pe.id = v_line.pack_enrollment_id and pe.active;
        end if;
        update public.billing_run_lines l set stopped_at = now() where l.id = v_line.id;
      end loop;

      if not exists (
        select 1 from public.billing_run_lines l
        where l.billing_run_id = v_intent.billing_run_id and l.student_id = v_intent.student_id
          and l.stopped_at is null
          and (v_intent.intent in ('dropped', 'paused')
               or private.billing_line_dropped(v_intent.subjects_dropped, l.enrollment_id, l.pack_enrollment_id))
      ) then
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

-- Ligne retirée et arrêtée : sa source n'est plus couverte (une reprise se facture).
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
          where l.billing_run_id = br.id
            and (l.enrollment_id = p_enrollment_id or l.pack_enrollment_id = p_pack_enrollment_id)
            and (br.status = 'draft' or l.invoice_id is not null or l.stopped_at is null)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------
-- Contrôle d'accès avant tout verrou
-- ---------------------------------------------------------------------
create or replace function public.set_reenrollment_intent(
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
  if not (select private.is_staff()) or not exists (
    select 1 from public.billing_runs br where br.id = p_run_id and br.center_id = (select private.auth_center_id())
  ) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
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

create or replace function public.confirm_billing_run(p_run_id uuid)
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
  v_later uuid;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.billing_runs br where br.id = p_run_id and (select private.can_read_finance(br.center_id))
  ) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
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

  -- Brouillons des mois suivants : sans les matières retirées de celle-ci.
  for v_later in
    select br.id from public.billing_runs br
    where br.center_id = v_run.center_id and br.status = 'draft'
      and (br.period_year, br.period_month) > (v_run.period_year, v_run.period_month)
  loop
    perform private.refresh_billing_run(v_later);
  end loop;

  -- Période déjà commencée (confirmation tardive) : abandons et pauses appliqués tout de suite.
  perform private.apply_reenrollment_intents(private.today(), p_run_id);
  return v_summary;
end;
$$;

create or replace function public.cancel_billing_run(p_run_id uuid, p_reason text)
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
  if not exists (
    select 1 from public.billing_runs br where br.id = p_run_id and (select private.can_read_finance(br.center_id))
  ) then
    raise exception 'Réservé à l''admin du centre.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.status <> 'draft' then
    raise exception 'Cette campagne n''est plus en brouillon.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 300 then
    raise exception 'Indiquez le motif (300 caractères au plus).' using errcode = '22023';
  end if;

  -- Rien ne sera facturé : prévisionnel à zéro.
  update public.billing_runs br
  set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = v_reason,
      total_expected = 0, student_count = 0
  where br.id = p_run_id;

  perform private.log_center_event(v_run.center_id, 'billing_run.cancelled', p_run_id,
    jsonb_build_object('year', v_run.period_year, 'month', v_run.period_month, 'reason', v_reason));
end;
$$;

create or replace function public.record_payment_reminder(
  p_run_id uuid,
  p_student_id uuid,
  p_due_date date,
  p_channel public.notification_channel,
  p_message text default null,
  p_phone text default null,
  p_template text default null,
  p_is_repeat boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_today date := private.today();
  v_message_id uuid := gen_random_uuid();
  v_type public.payment_reminder_type;
  v_overdue_from date;
  v_invoices uuid[];
  v_amount numeric;
begin
  if (select private.in_support_write()) then
    raise exception 'Mode support : lecture seule.' using errcode = '42501';
  end if;
  if not (select private.is_staff()) or not exists (
    select 1 from public.billing_runs br where br.id = p_run_id and br.center_id = (select private.auth_center_id())
  ) then
    raise exception 'Campagne introuvable.' using errcode = '42501';
  end if;
  select * into v_run from public.billing_runs br where br.id = p_run_id for update;
  if v_run.status not in ('confirmed', 'sent', 'closed') then
    raise exception 'Les rappels suivent la confirmation de la campagne.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.centers c where c.id = v_run.center_id and c.payment_reminders_enabled) then
    raise exception 'Les rappels de paiement sont désactivés dans les réglages.' using errcode = '22023';
  end if;
  if p_message is not null and length(p_message) > 2000 then
    raise exception 'Message trop long.' using errcode = '22023';
  end if;

  select array_agg(i.id order by i.id), min(i.overdue_from), sum(i.amount_due - i.amount_paid)
  into v_invoices, v_overdue_from, v_amount
  from (
    select i.* from public.invoices i
    where i.billing_run_id = p_run_id and i.student_id = p_student_id and i.due_date = p_due_date and i.status <> 'paid'
    order by i.id
    for update
  ) i;
  if v_invoices is null then
    raise exception 'Facture déjà réglée : aucun rappel.' using errcode = '23514';
  end if;

  v_type := case when v_today >= v_overdue_from then 'overdue'
                 when v_today = p_due_date then 'due_today'
                 else 'upcoming' end;

  if not p_is_repeat and exists (
    select 1 from public.payment_reminders pr
    where pr.invoice_id = any(v_invoices) and pr.reminder_type = v_type and pr.status = 'sent' and not pr.is_repeat
  ) then
    raise exception 'Rappel déjà envoyé : utilisez « Relancer ».' using errcode = '22023';
  end if;

  insert into public.payment_reminders (
    student_id, invoice_id, message_id, reminder_type, channel, template_used, message_body,
    guardian_phone_used, days_overdue, status, is_repeat
  )
  select p_student_id, invoice_id, v_message_id, v_type, p_channel, p_template, p_message,
         p_phone, case when v_type = 'overdue' then v_today - p_due_date end, 'sent', p_is_repeat
  from unnest(v_invoices) as invoice_id;

  -- Premier rappel : la campagne passe à « rappels envoyés ».
  if v_run.status = 'confirmed' then
    update public.billing_runs br set status = 'sent', sent_at = now() where br.id = p_run_id;
  end if;

  perform private.log_center_event(v_run.center_id, 'payment_reminder.sent', p_student_id,
    jsonb_build_object('billing_run_id', p_run_id, 'message_id', v_message_id, 'reminder_type', v_type,
                       'channel', p_channel, 'invoices', cardinality(v_invoices), 'amount', v_amount,
                       'due_date', p_due_date, 'repeat', p_is_repeat));
  return v_message_id;
end;
$$;
