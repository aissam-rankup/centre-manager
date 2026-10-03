-- =====================================================================
-- CentroManager — 042 : pilotage, corrections de la revue (page 8, phase 5)
--
--  * Courbe du mois précédent bornée à sa longueur, comme la comparaison
--    chiffrée ; vide si le mois précédent n'avait aucune facture.
--  * Réinscription par matière : décisions « reconduit » seulement (les
--    élèves sans décision, les abandons et les pauses sont comptés à part).
-- =====================================================================

create or replace function public.admin_collection_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_today date := private.today();
  v_month date := date_trunc('month', v_today::timestamp)::date;
  v_next date := (v_month + interval '1 month')::date;
  v_prev date := (v_month - interval '1 month')::date;
  v_days integer := (v_next - v_month);
  v_prev_days integer := (v_month - v_prev);
  v_day integer := extract(day from v_today)::integer;
  v_result jsonb;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  with billed as (
    select date_trunc('month', i.period_start)::date as m,
           i.amount_due,
           i.amount_paid,
           case when i.status = 'paid' then (i.paid_at at time zone 'Africa/Casablanca')::date end as paid_on
    from public.invoices i
    join public.students s on s.id = i.student_id and s.center_id = v_center_id
    where i.period_start >= v_prev and i.period_start < v_next
  ),
  days as (
    select g as day,
           v_month + (g - 1) as current_date,
           -- Même jour du mois précédent, borné à sa longueur (comme la comparaison chiffrée) ;
           -- rien à comparer si le mois précédent n'avait aucune facture.
           case when exists (select 1 from billed b where b.m = v_prev)
                then v_prev + (least(g, v_prev_days) - 1) end as previous_date
    from generate_series(1, v_days) as g
  ),
  curve as (
    select d.day,
           case when d.current_date <= v_today then
             (select coalesce(sum(b.amount_paid), 0) from billed b where b.m = v_month and b.paid_on <= d.current_date)
           end as current_total,
           case when d.previous_date is not null then
             (select coalesce(sum(b.amount_paid), 0) from billed b where b.m = v_prev and b.paid_on <= d.previous_date)
           end as previous_total
    from days d
  )
  select jsonb_build_object(
    'month_start', v_month,
    'today', v_today,
    'expected', coalesce((select sum(b.amount_due) from billed b where b.m = v_month), 0),
    'collected', coalesce((select sum(b.amount_paid) from billed b where b.m = v_month and b.paid_on <= v_today), 0),
    'invoices', (select count(*) from billed b where b.m = v_month),
    'paid_invoices', (select count(*) from billed b where b.m = v_month and b.paid_on <= v_today),
    'previous', jsonb_build_object(
      'month_start', v_prev,
      'expected', coalesce((select sum(b.amount_due) from billed b where b.m = v_prev), 0),
      'collected', coalesce((select sum(b.amount_paid) from billed b where b.m = v_prev and b.paid_on is not null), 0),
      'collected_same_day', coalesce((
        select sum(b.amount_paid) from billed b
        where b.m = v_prev and b.paid_on <= v_prev + (least(v_day, v_prev_days) - 1)
      ), 0)
    ),
    'days', (select jsonb_agg(jsonb_build_object('day', c.day, 'current', c.current_total, 'previous', c.previous_total)
                              order by c.day) from curve c)
  )
  into v_result;
  return v_result;
end;
$$;

create or replace function public.reenrollment_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_run public.billing_runs;
  v_result jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_run
  from public.billing_runs br
  where br.center_id = (select private.auth_center_id()) and br.status <> 'cancelled'
  -- La dernière campagne confirmée (décisions définitives), sinon le brouillon.
  order by br.status = 'draft', br.period_year desc, br.period_month desc
  limit 1;
  if v_run.id is null then
    return null;
  end if;

  with intents as (
    select ri.* from public.reenrollment_intents ri where ri.billing_run_id = v_run.id
  ),
  items as (
    -- Décisions « reconduit » seulement : matières reconduites et retirées par ces élèves
    -- (ni les élèves sans décision, ni les abandons et pauses, comptés à part).
    select x.item ->> 'kind' as kind, x.item ->> 'name' as name, true as kept
    from intents ri cross join lateral jsonb_array_elements(ri.subjects_kept) as x(item)
    where ri.intent = 'confirmed'
    union all
    select x.item ->> 'kind', x.item ->> 'name', false
    from intents ri cross join lateral jsonb_array_elements(ri.subjects_dropped) as x(item)
    where ri.intent = 'confirmed'
  ),
  -- Par nom : une même matière enseignée à plusieurs niveaux compte une fois.
  per_item as (
    select i.kind, i.name,
           count(*) filter (where i.kept)::integer as kept,
           count(*) filter (where not i.kept)::integer as dropped
    from items i
    group by i.kind, i.name
  )
  select jsonb_build_object(
    'run_id', v_run.id,
    'year', v_run.period_year,
    'month', v_run.period_month,
    'status', v_run.status,
    'pending', (select count(*) from intents where intent = 'pending'),
    'confirmed', (select count(*) from intents where intent = 'confirmed'),
    'dropped', (select count(*) from intents where intent = 'dropped'),
    'paused', (select count(*) from intents where intent = 'paused'),
    'subjects_removed', (select count(*) from intents where intent = 'confirmed' and jsonb_array_length(subjects_dropped) > 0),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'name', p.name, 'kept', p.kept, 'dropped', p.dropped)
                       order by p.dropped desc, p.name)
      from per_item p
    ), '[]'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;
