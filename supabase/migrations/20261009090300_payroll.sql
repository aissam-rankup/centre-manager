-- =====================================================================
-- CentroManager — 025 : paie des professeurs (page 6, module 2)
--
-- Règles validées :
--  * salaire fixe mensuel, ou commission par couple professeur-matière ;
--  * commission d'une matière = tarif mensuel plein de la matière
--    × nombre d'élèves inscrits × taux ; les élèves en pack comptent dans
--    chaque matière du pack au tarif plein de la matière ; ni les impayés
--    ni les remises ne diminuent la commission ;
--  * historique des salaires et des taux conservé (nouvelle ligne à chaque
--    changement, périodes sans chevauchement) ;
--  * période mensuelle : brouillon recalculable, puis validée (montants
--    figés), puis versée ligne par ligne ; déverrouillage tracé ;
--  * ajustement (prime, retenue, avance) à part du calculé, motif obligatoire ;
--  * lisible par l'admin du centre uniquement, jamais en mode support.
--
-- Inscrits d'un mois : inscriptions actives au moment du calcul, commencées
-- au plus tard le dernier jour du mois (le statut d'une inscription n'est pas
-- historisé ; la validation fige le résultat).
-- =====================================================================

create type public.pay_mode as enum ('fixed_salary', 'commission');
create type public.payroll_status as enum ('draft', 'validated', 'paid');

alter table public.profiles
  add column pay_mode public.pay_mode,
  add constraint profiles_pay_mode_check check (pay_mode is null or role = 'teacher');

-- Seul l'admin choisit le mode de rémunération.
create function private.profiles_guard_pay_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pay_mode is distinct from old.pay_mode and (select auth.uid()) is not null and not private.is_admin() then
    raise exception 'Seul l''administrateur choisit le mode de rémunération.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_pay_mode
before update of pay_mode on public.profiles
for each row execute function private.profiles_guard_pay_mode();

-- ---------------------------------------------------------------------
-- Salaires et taux (historisés)
-- ---------------------------------------------------------------------
create table public.teacher_salaries (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  teacher_id uuid not null,
  monthly_amount numeric(10, 2) not null check (monthly_amount >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (teacher_id, center_id) references public.profiles (id, center_id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  constraint teacher_salaries_no_overlap exclude using gist (
    teacher_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

create index teacher_salaries_center_idx on public.teacher_salaries (center_id);
create index teacher_salaries_created_by_idx on public.teacher_salaries (created_by);

create table public.teacher_commissions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  teacher_id uuid not null,
  subject_id uuid not null,
  level_id uuid not null,
  rate_percent numeric(5, 2) not null check (rate_percent between 0 and 100),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (teacher_id, center_id) references public.profiles (id, center_id) on delete cascade,
  foreign key (subject_id, level_id) references public.subjects (id, level_id) on delete cascade,
  check (effective_to is null or effective_to >= effective_from),
  constraint teacher_commissions_no_overlap exclude using gist (
    teacher_id with =,
    subject_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

create index teacher_commissions_center_idx on public.teacher_commissions (center_id);
create index teacher_commissions_subject_idx on public.teacher_commissions (subject_id, level_id);
create index teacher_commissions_created_by_idx on public.teacher_commissions (created_by);

create function private.pay_rows_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = new.teacher_id and p.center_id = new.center_id and p.role = 'teacher'
  ) then
    raise exception 'Le compte doit être un professeur du centre.' using errcode = '23514';
  end if;
  if tg_table_name = 'teacher_commissions' then
    if not exists (
      select 1 from public.subjects s where s.id = (to_jsonb(new) ->> 'subject_id')::uuid and s.center_id = new.center_id
    ) then
      raise exception 'La matière doit appartenir au centre.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger teacher_salaries_before_write
before insert or update on public.teacher_salaries
for each row execute function private.pay_rows_before_write();

create trigger teacher_commissions_before_write
before insert or update on public.teacher_commissions
for each row execute function private.pay_rows_before_write();

-- Nouveau salaire à partir d'une date : la ligne en cours se termine la veille.
create function public.set_teacher_salary(p_teacher_id uuid, p_monthly_amount numeric, p_effective_from date)
returns public.teacher_salaries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.teacher_salaries;
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  delete from public.teacher_salaries
  where teacher_id = p_teacher_id and effective_from >= p_effective_from;

  update public.teacher_salaries
  set effective_to = p_effective_from - 1
  where teacher_id = p_teacher_id and (effective_to is null or effective_to >= p_effective_from);

  insert into public.teacher_salaries (center_id, teacher_id, monthly_amount, effective_from)
  values (private.auth_center_id(), p_teacher_id, round(p_monthly_amount, 2), p_effective_from)
  returning * into v_row;
  return v_row;
end;
$$;

create function public.set_teacher_commission(
  p_teacher_id uuid,
  p_subject_id uuid,
  p_rate_percent numeric,
  p_effective_from date
)
returns public.teacher_commissions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.teacher_commissions;
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  delete from public.teacher_commissions
  where teacher_id = p_teacher_id and subject_id = p_subject_id and effective_from >= p_effective_from;

  update public.teacher_commissions
  set effective_to = p_effective_from - 1
  where teacher_id = p_teacher_id and subject_id = p_subject_id
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.teacher_commissions (center_id, teacher_id, subject_id, level_id, rate_percent, effective_from)
  select private.auth_center_id(), p_teacher_id, s.id, s.level_id, round(p_rate_percent, 2), p_effective_from
  from public.subjects s
  where s.id = p_subject_id
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Périodes et lignes de paie
-- ---------------------------------------------------------------------
create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  status public.payroll_status not null default 'draft',
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (center_id, year, month),
  unique (id, center_id),
  check (status = 'draft' or validated_at is not null)
);

create index payroll_periods_validated_by_idx on public.payroll_periods (validated_by);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null,
  center_id uuid not null,
  teacher_id uuid not null,
  teacher_name text not null,
  -- Nul : mode de rémunération pas encore choisi.
  pay_mode public.pay_mode,
  computed_amount numeric(12, 2) not null default 0,
  -- Fixe : {salary_id, monthly_amount, effective_from} ;
  -- commission : {subjects: [{subject_id, subject, level_id, level, monthly_price, enrolled, rate_percent, subtotal}]}.
  detail jsonb not null default '{}'::jsonb,
  adjustment_amount numeric(12, 2) not null default 0,
  adjustment_reason text,
  final_amount numeric(12, 2) generated always as (computed_amount + adjustment_amount) stored,
  paid_at date,
  payment_method public.payment_method,
  paid_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (payroll_period_id, center_id) references public.payroll_periods (id, center_id) on delete cascade,
  foreign key (teacher_id) references public.profiles (id) on delete cascade,
  unique (payroll_period_id, teacher_id),
  check (adjustment_amount = 0 or length(btrim(adjustment_reason)) between 1 and 200),
  check ((paid_at is null) = (payment_method is null))
);

create index payroll_lines_center_idx on public.payroll_lines (center_id);
create index payroll_lines_teacher_idx on public.payroll_lines (teacher_id);
create index payroll_lines_paid_by_idx on public.payroll_lines (paid_by);

-- Calcul d'un mois pour un professeur.
create function private.compute_teacher_pay(p_teacher_id uuid, p_year integer, p_month integer)
returns table (pay_mode public.pay_mode, amount numeric, detail jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  v_mode public.pay_mode;
  v_salary public.teacher_salaries;
  v_subjects jsonb;
begin
  select p.pay_mode into v_mode from public.profiles p where p.id = p_teacher_id;

  if v_mode = 'fixed_salary' then
    select * into v_salary
    from public.teacher_salaries s
    where s.teacher_id = p_teacher_id and s.effective_from <= v_end
      and (s.effective_to is null or s.effective_to >= v_start)
    order by s.effective_from desc
    limit 1;
    return query select v_mode, coalesce(v_salary.monthly_amount, 0)::numeric,
      jsonb_build_object('salary_id', v_salary.id, 'monthly_amount', v_salary.monthly_amount,
                         'effective_from', v_salary.effective_from);
    return;
  end if;

  if v_mode = 'commission' then
    with lines as (
      select
        s.id as subject_id, s.name as subject, l.id as level_id, l.name as level, l.sort_order,
        s.monthly_price,
        (select count(distinct e.student_id)
           from public.enrollments e
           where e.subject_id = s.id and e.active and e.start_date <= v_end)::integer as enrolled,
        (select c.rate_percent
           from public.teacher_commissions c
           where c.teacher_id = p_teacher_id and c.subject_id = s.id and c.effective_from <= v_end
             and (c.effective_to is null or c.effective_to >= v_start)
           order by c.effective_from desc
           limit 1) as rate_percent
      from public.teacher_assignments ta
      join public.subjects s on s.id = ta.subject_id
      join public.levels l on l.id = ta.level_id
      where ta.teacher_id = p_teacher_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'subject_id', subject_id, 'subject', subject, 'level_id', level_id, 'level', level,
             'monthly_price', monthly_price, 'enrolled', enrolled, 'rate_percent', rate_percent,
             'subtotal', round(monthly_price * enrolled * coalesce(rate_percent, 0) / 100, 2)
           ) order by sort_order, subject), '[]'::jsonb)
      into v_subjects
    from lines;

    return query select v_mode,
      coalesce((select sum((x ->> 'subtotal')::numeric) from jsonb_array_elements(v_subjects) as x), 0),
      jsonb_build_object('subjects', v_subjects);
    return;
  end if;

  return query select null::public.pay_mode, 0::numeric, '{}'::jsonb;
end;
$$;

-- Montants figés hors brouillon ; total de la période tenu à jour.
create function private.payroll_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.payroll_status;
begin
  select pp.status into v_status from public.payroll_periods pp where pp.id = (coalesce(new, old)).payroll_period_id;
  if v_status <> 'draft' and (
    tg_op <> 'UPDATE'
    or (new.computed_amount, new.adjustment_amount, new.adjustment_reason, new.detail, new.pay_mode)
       is distinct from (old.computed_amount, old.adjustment_amount, old.adjustment_reason, old.detail, old.pay_mode)
  ) and exists (select 1 from public.payroll_periods pp where pp.id = (coalesce(new, old)).payroll_period_id) then
    raise exception 'Paie validée : déverrouillez la période pour la modifier.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.adjustment_reason := nullif(btrim(new.adjustment_reason), '');
  end if;
  return coalesce(new, old);
end;
$$;

create trigger payroll_lines_guard
before insert or update or delete on public.payroll_lines
for each row execute function private.payroll_lines_guard();

create function private.payroll_lines_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid := (coalesce(new, old)).payroll_period_id;
begin
  update public.payroll_periods pp
  set total_amount = coalesce((select sum(pl.final_amount) from public.payroll_lines pl where pl.payroll_period_id = pp.id), 0),
      status = case
        when pp.status = 'draft' then 'draft'
        when exists (select 1 from public.payroll_lines pl where pl.payroll_period_id = pp.id)
             and not exists (select 1 from public.payroll_lines pl where pl.payroll_period_id = pp.id and pl.paid_at is null)
          then 'paid'
        else 'validated'
      end::public.payroll_status
  where pp.id = v_period_id;
  return null;
end;
$$;

create trigger payroll_lines_after_write
after insert or update or delete on public.payroll_lines
for each row execute function private.payroll_lines_after_write();

-- Brouillon du mois : crée la période et recalcule chaque professeur
-- (les ajustements sont conservés).
create function public.payroll_refresh(p_year integer, p_month integer)
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

  insert into public.payroll_lines (payroll_period_id, center_id, teacher_id, teacher_name, pay_mode, computed_amount, detail)
  select v_period.id, v_center_id, p.id, p.full_name, c.pay_mode, c.amount, c.detail
  from public.profiles p
  cross join lateral private.compute_teacher_pay(p.id, p_year, p_month) as c
  where p.center_id = v_center_id and p.role = 'teacher' and p.active
  on conflict (payroll_period_id, teacher_id) do update
  set teacher_name = excluded.teacher_name,
      pay_mode = excluded.pay_mode,
      computed_amount = excluded.computed_amount,
      detail = excluded.detail;

  -- Professeurs partis : retirés s'ils n'ont pas d'ajustement.
  delete from public.payroll_lines pl
  where pl.payroll_period_id = v_period.id and pl.adjustment_amount = 0
    and not exists (
      select 1 from public.profiles p where p.id = pl.teacher_id and p.role = 'teacher' and p.active
    );

  select * into v_period from public.payroll_periods where id = v_period.id;
  return v_period;
end;
$$;

create function public.payroll_set_adjustment(p_line_id uuid, p_amount numeric, p_reason text)
returns public.payroll_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.payroll_lines;
begin
  select * into v_line from public.payroll_lines where id = p_line_id;
  if v_line.id is null or not private.can_read_finance(v_line.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <> 0 and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif de l''ajustement.' using errcode = '22023';
  end if;

  update public.payroll_lines
  set adjustment_amount = round(coalesce(p_amount, 0), 2),
      adjustment_reason = case when coalesce(p_amount, 0) = 0 then null else btrim(p_reason) end
  where id = p_line_id
  returning * into v_line;
  return v_line;
end;
$$;

create function public.payroll_validate(p_period_id uuid)
returns public.payroll_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.payroll_periods;
begin
  select * into v_period from public.payroll_periods where id = p_period_id for update;
  if v_period.id is null or not private.can_read_finance(v_period.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_period.status <> 'draft' then
    raise exception 'Cette paie est déjà validée.' using errcode = '22023';
  end if;

  perform public.payroll_refresh(v_period.year, v_period.month);

  update public.payroll_periods
  set status = 'validated', validated_by = (select auth.uid()), validated_at = now()
  where id = p_period_id
  returning * into v_period;

  perform private.log_center_event(v_period.center_id, 'payroll.validated', v_period.id,
    jsonb_build_object('year', v_period.year, 'month', v_period.month, 'total', v_period.total_amount));
  return v_period;
end;
$$;

create function public.payroll_unlock(p_period_id uuid, p_reason text)
returns public.payroll_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.payroll_periods;
begin
  select * into v_period from public.payroll_periods where id = p_period_id for update;
  if v_period.id is null or not private.can_read_finance(v_period.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_period.status = 'draft' then
    return v_period;
  end if;
  if exists (select 1 from public.payroll_lines pl where pl.payroll_period_id = p_period_id and pl.paid_at is not null) then
    raise exception 'Des versements sont déjà enregistrés : la paie ne peut plus être déverrouillée.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Indiquez le motif du déverrouillage.' using errcode = '22023';
  end if;

  update public.payroll_periods
  set status = 'draft', validated_by = null, validated_at = null
  where id = p_period_id
  returning * into v_period;

  perform private.log_center_event(v_period.center_id, 'payroll.unlocked', v_period.id,
    jsonb_build_object('year', v_period.year, 'month', v_period.month, 'reason', btrim(p_reason)));
  return v_period;
end;
$$;

create function public.payroll_mark_paid(p_line_id uuid, p_paid_at date, p_method public.payment_method)
returns public.payroll_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.payroll_lines;
  v_status public.payroll_status;
begin
  select * into v_line from public.payroll_lines where id = p_line_id;
  select pp.status into v_status from public.payroll_periods pp where pp.id = v_line.payroll_period_id;

  if v_line.id is null or not private.can_read_finance(v_line.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if v_status = 'draft' then
    raise exception 'Validez la paie avant d''enregistrer les versements.' using errcode = '22023';
  end if;

  update public.payroll_lines
  set paid_at = p_paid_at, payment_method = p_method, paid_by = (select auth.uid())
  where id = p_line_id
  returning * into v_line;

  perform private.log_center_event(v_line.center_id, 'payroll.line_paid', v_line.id,
    jsonb_build_object('teacher_id', v_line.teacher_id, 'amount', v_line.final_amount, 'method', p_method));
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS : admin du centre, hors mode support
-- ---------------------------------------------------------------------
alter table public.teacher_salaries enable row level security;
alter table public.teacher_commissions enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_lines enable row level security;

create policy teacher_salaries_admin on public.teacher_salaries
for all to authenticated
using ((select private.can_read_finance(center_id)))
with check ((select private.can_read_finance(center_id)));

create policy teacher_commissions_admin on public.teacher_commissions
for all to authenticated
using ((select private.can_read_finance(center_id)))
with check ((select private.can_read_finance(center_id)));

create policy payroll_periods_select_admin on public.payroll_periods
for select to authenticated
using ((select private.can_read_finance(center_id)));

create policy payroll_lines_select_admin on public.payroll_lines
for select to authenticated
using ((select private.can_read_finance(center_id)));

do $$
declare
  v_table text;
begin
  foreach v_table in array array['teacher_salaries', 'teacher_commissions', 'payroll_periods', 'payroll_lines'] loop
    execute format(
      'create trigger deny_support_writes before insert or update or delete on public.%I
         for each row execute function private.deny_support_writes()', v_table);
  end loop;
end;
$$;

revoke all on public.teacher_salaries, public.teacher_commissions, public.payroll_periods, public.payroll_lines
from anon, authenticated;
grant select, insert, update, delete on public.teacher_salaries, public.teacher_commissions to authenticated;
grant select on public.payroll_periods, public.payroll_lines to authenticated;

revoke all on function private.compute_teacher_pay(uuid, integer, integer) from public, anon, authenticated;
revoke all on function
  public.set_teacher_salary(uuid, numeric, date),
  public.set_teacher_commission(uuid, uuid, numeric, date),
  public.payroll_refresh(integer, integer),
  public.payroll_set_adjustment(uuid, numeric, text),
  public.payroll_validate(uuid),
  public.payroll_unlock(uuid, text),
  public.payroll_mark_paid(uuid, date, public.payment_method)
from public, anon;
grant execute on function
  public.set_teacher_salary(uuid, numeric, date),
  public.set_teacher_commission(uuid, uuid, numeric, date),
  public.payroll_refresh(integer, integer),
  public.payroll_set_adjustment(uuid, numeric, text),
  public.payroll_validate(uuid),
  public.payroll_unlock(uuid, text),
  public.payroll_mark_paid(uuid, date, public.payment_method)
to authenticated;
