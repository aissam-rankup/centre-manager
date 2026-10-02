-- =====================================================================
-- CentroManager — 029 : résultat financier du centre (tableau de bord)
--
-- Par mois (12 mois glissants, mois en cours compris) :
--  * prévu / encaissé : factures dont la période commence dans le mois
--    (même définition que les indicateurs existants du tableau de bord) ;
--  * masse salariale : paie enregistrée du mois ; pour le mois en cours non
--    validé, calcul du moment (professeurs actifs) plus les ajustements ;
--  * charges : charges confirmées du mois, hors charges supprimées ;
--  * remises : remises appliquées aux factures du mois, élèves concernés.
-- Admin du centre uniquement, jamais en mode support.
-- =====================================================================

create function public.admin_financial_summary(p_months integer default 12)
returns table (
  month_start date,
  expected numeric,
  collected numeric,
  payroll numeric,
  expenses numeric,
  discounts numeric,
  discount_students integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_current date := date_trunc('month', private.today()::timestamp)::date;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  with months as (
    select (v_current - make_interval(months => g))::date as m
    from generate_series(0, greatest(1, least(p_months, 36)) - 1) as g
  ),
  billing as (
    select date_trunc('month', i.period_start)::date as m,
           sum(i.amount_due) as expected,
           sum(i.amount_paid) as collected,
           sum(i.discount_amount) as discounts,
           count(distinct i.student_id) filter (where i.discount_amount > 0) as discount_students
    from public.invoices i
    join public.students s on s.id = i.student_id and s.center_id = v_center_id
    where i.period_start >= (select min(m) from months)
    group by 1
  ),
  spending as (
    select make_date(e.period_year, e.period_month, 1) as m, sum(e.amount) as total
    from public.expenses e
    where e.center_id = v_center_id and e.status = 'confirmed' and e.deleted_at is null
    group by 1
  ),
  recorded_pay as (
    select make_date(pp.year, pp.month, 1) as m, pp.total_amount, pp.status, pp.id
    from public.payroll_periods pp
    where pp.center_id = v_center_id
  ),
  live_pay as (
    -- Mois en cours non validé : calcul du moment, ajustements déjà saisis compris.
    select coalesce(sum(c.amount), 0)
         + coalesce((select sum(pl.adjustment_amount)
                     from public.payroll_lines pl
                     join recorded_pay r on r.id = pl.payroll_period_id and r.m = v_current), 0) as total
    from public.profiles p
    cross join lateral private.compute_teacher_pay(
      p.id, extract(year from v_current)::integer, extract(month from v_current)::integer) as c
    where p.center_id = v_center_id and p.role = 'teacher' and p.active
  )
  select
    mo.m,
    coalesce(b.expected, 0)::numeric,
    coalesce(b.collected, 0)::numeric,
    (case
       when r.status in ('validated', 'paid') then r.total_amount
       when mo.m = v_current then (select total from live_pay)
       else coalesce(r.total_amount, 0)
     end)::numeric,
    coalesce(sp.total, 0)::numeric,
    coalesce(b.discounts, 0)::numeric,
    coalesce(b.discount_students, 0)::integer
  from months mo
  left join billing b on b.m = mo.m
  left join spending sp on sp.m = mo.m
  left join recorded_pay r on r.m = mo.m
  order by mo.m;
end;
$$;

-- Remises du mois par motif (factures dont la période commence dans le mois).
create function public.admin_discount_summary(p_month date default null)
returns table (reason public.discount_reason, amount numeric, students integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_month date := date_trunc('month', coalesce(p_month, private.today())::timestamp)::date;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select (i.discount_snapshot ->> 'reason')::public.discount_reason,
         sum(i.discount_amount)::numeric,
         count(distinct i.student_id)::integer
  from public.invoices i
  join public.students s on s.id = i.student_id and s.center_id = v_center_id
  where i.discount_amount > 0
    and i.discount_snapshot ? 'reason'
    and i.period_start >= v_month
    and i.period_start < (v_month + interval '1 month')::date
  group by 1
  order by 2 desc;
end;
$$;

revoke all on function public.admin_financial_summary(integer), public.admin_discount_summary(date) from public, anon;
grant execute on function public.admin_financial_summary(integer), public.admin_discount_summary(date) to authenticated;
