-- =====================================================================
-- CentroManager — paie de l'équipe : salaire fixe des assistants et admins
--
-- La paie ne gérait que les professeurs. Un assistant (ou un admin salarié)
-- peut désormais recevoir un salaire fixe mensuel :
--  * mode « salaire fixe » uniquement (la commission reste propre aux
--    professeurs) ; salaires historisés dans teacher_salaries, comme pour
--    les professeurs (nom de table conservé) ;
--  * un membre non professeur entre dans la paie du mois dès que son mode
--    est « salaire fixe » ; il en sort quand l'admin retire son salaire ;
--  * le rôle du membre est figé sur la ligne de paie (reçus, fiches) ;
--  * calcul des professeurs inchangé ;
--  * montants lisibles par l'admin du centre uniquement (RLS existantes :
--    private.can_read_finance), jamais par l'assistant lui-même.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qui est dans la paie
-- ---------------------------------------------------------------------
alter table public.profiles
  drop constraint profiles_pay_mode_check,
  add constraint profiles_pay_mode_check check (
    pay_mode is null
    or role = 'teacher'
    or (role in ('admin', 'assistant') and pay_mode = 'fixed_salary')
  );

-- Professeur actif, ou autre membre actif payé en salaire fixe.
create function private.on_payroll(p_role public.user_role, p_pay_mode public.pay_mode, p_active boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_active, false) and (
    p_role = 'teacher'
    or (p_role in ('admin', 'assistant') and p_pay_mode = 'fixed_salary')
  );
$$;

revoke all on function private.on_payroll(public.user_role, public.pay_mode, boolean) from public, anon;
grant execute on function private.on_payroll(public.user_role, public.pay_mode, boolean) to authenticated, service_role;

-- Salaires : professeur, assistant ou admin du centre ; taux : professeur.
create or replace function private.pay_rows_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'teacher_commissions' then
    if not exists (
      select 1 from public.profiles p where p.id = new.teacher_id and p.center_id = new.center_id and p.role = 'teacher'
    ) then
      raise exception 'Le compte doit être un professeur du centre.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.subjects s where s.id = (to_jsonb(new) ->> 'subject_id')::uuid and s.center_id = new.center_id
    ) then
      raise exception 'La matière doit appartenir au centre.' using errcode = '23514';
    end if;
  elsif not exists (
    select 1 from public.profiles p
    where p.id = new.teacher_id and p.center_id = new.center_id and p.role in ('teacher', 'assistant', 'admin')
  ) then
    raise exception 'Le compte doit être un membre de l''équipe du centre.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Rôle figé sur la ligne de paie
-- ---------------------------------------------------------------------
alter table public.payroll_lines add column member_role public.user_role not null default 'teacher';
alter table public.payroll_lines alter column member_role drop default;

-- Rôle non fourni : celui du compte.
create function private.payroll_lines_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_role is null then
    select p.role into new.member_role from public.profiles p where p.id = new.teacher_id;
  end if;
  return new;
end;
$$;

create trigger payroll_lines_member_role
before insert on public.payroll_lines
for each row execute function private.payroll_lines_member_role();

-- ---------------------------------------------------------------------
-- Salaire fixe d'un assistant ou d'un admin (montant nul : retiré de la paie)
-- ---------------------------------------------------------------------
create function public.set_staff_salary(p_member_id uuid, p_monthly_amount numeric default null, p_effective_from date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_current numeric;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_member_id and p.center_id = v_center_id and p.role in ('assistant', 'admin')
  ) then
    raise exception 'Membre de l''équipe introuvable.' using errcode = 'P0002';
  end if;

  -- Retrait de la paie : le mode est effacé, l'historique des salaires reste.
  if p_monthly_amount is null then
    update public.profiles set pay_mode = null where id = p_member_id and pay_mode is not null;
    perform private.log_center_event(v_center_id, 'payroll.pay_settings_changed', p_member_id,
      jsonb_build_object('pay_mode', null));
    return;
  end if;

  if p_monthly_amount < 0 then
    raise exception 'Indiquez le salaire mensuel.' using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'Indiquez la date d''effet.' using errcode = '22023';
  end if;

  update public.profiles set pay_mode = 'fixed_salary' where id = p_member_id and pay_mode is distinct from 'fixed_salary';

  select s.monthly_amount into v_current
  from public.teacher_salaries s
  where s.teacher_id = p_member_id and s.effective_from <= p_effective_from
    and (s.effective_to is null or s.effective_to >= p_effective_from)
  order by s.effective_from desc
  limit 1;
  if v_current is distinct from round(p_monthly_amount, 2) then
    perform public.set_teacher_salary(p_member_id, p_monthly_amount, p_effective_from);
  end if;

  perform private.log_center_event(v_center_id, 'payroll.pay_settings_changed', p_member_id,
    jsonb_build_object('pay_mode', 'fixed_salary', 'effective_from', p_effective_from,
                       'monthly_amount', p_monthly_amount));
end;
$$;

revoke all on function public.set_staff_salary(uuid, numeric, date) from public, anon;
grant execute on function public.set_staff_salary(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------
-- Brouillon du mois : professeurs et membres salariés
-- ---------------------------------------------------------------------
create or replace function public.payroll_refresh(p_year integer, p_month integer)
returns public.payroll_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_period public.payroll_periods;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  insert into public.payroll_periods (center_id, year, month)
  values (v_center_id, p_year, p_month)
  on conflict (center_id, year, month) do nothing;

  select * into v_period from public.payroll_periods pp
  where pp.center_id = v_center_id and pp.year = p_year and pp.month = p_month
  for update;

  if v_period.status <> 'draft' then
    return v_period;
  end if;

  insert into public.payroll_lines (payroll_period_id, center_id, teacher_id, teacher_name, member_role, pay_mode, computed_amount, detail)
  select v_period.id, v_center_id, p.id, p.full_name, p.role, c.pay_mode, c.amount, c.detail
  from public.profiles p
  cross join lateral private.compute_teacher_pay(p.id, p_year, p_month) as c
  where p.center_id = v_center_id and private.on_payroll(p.role, p.pay_mode, p.active)
  on conflict (payroll_period_id, teacher_id) do update
  set teacher_name = excluded.teacher_name,
      member_role = excluded.member_role,
      pay_mode = excluded.pay_mode,
      computed_amount = excluded.computed_amount,
      detail = excluded.detail;

  -- Membres partis ou retirés de la paie : retirés s'ils n'ont pas d'ajustement.
  delete from public.payroll_lines pl
  where pl.payroll_period_id = v_period.id and pl.adjustment_amount = 0
    and not exists (
      select 1 from public.profiles p
      where p.id = pl.teacher_id and private.on_payroll(p.role, p.pay_mode, p.active)
    );

  select * into v_period from public.payroll_periods where id = v_period.id;
  return v_period;
end;
$$;

-- ---------------------------------------------------------------------
-- Tableau financier : la paie du mois en cours compte aussi les salariés
-- ---------------------------------------------------------------------
create or replace function public.admin_financial_summary(p_months integer default 12)
returns table (month_start date, expected numeric, collected numeric, payroll numeric, expenses numeric, discounts numeric, discount_students integer)
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
    where p.center_id = v_center_id and private.on_payroll(p.role, p.pay_mode, p.active)
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

-- Module « finance » : le réglage du salaire de l'équipe en fait partie.
insert into private.module_resources (name, module_key, kind) values ('set_staff_salary', 'finance', 'function');
