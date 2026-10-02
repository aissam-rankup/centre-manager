-- =====================================================================
-- CentroManager — 026 : charges du centre (page 6, module 3)
--
--  * catégories pré-remplies à la création d'un centre (et pour les centres
--    existants), modifiables et désactivables par l'admin ;
--  * une charge récurrente (loyer, internet…) est recopiée chaque mois en
--    brouillon, avec le montant de la dernière occurrence, à confirmer par
--    l'admin ; les brouillons ne comptent pas dans les totaux ;
--  * suppression = retrait horodaté avec son auteur (la ligne reste) ;
--  * justificatif facultatif dans le bucket privé « expense-receipts » ;
--  * lisible par l'admin du centre uniquement, jamais en mode support.
-- =====================================================================

create type public.expense_status as enum ('draft', 'confirmed');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Nom d'icône de l'interface (ex. « house », « wifi »).
  icon text not null default 'receipt' check (icon ~ '^[a-z0-9-]{1,40}$'),
  is_recurring boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (center_id, name),
  unique (id, center_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  category_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 120),
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default private.today(),
  period_year smallint not null check (period_year between 2000 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  payment_method public.payment_method,
  -- Chemin du justificatif : {center_id}/{fichier}.
  receipt_url text,
  is_recurring boolean not null default false,
  recurrence_day smallint check (recurrence_day between 1 and 28),
  notes text check (notes is null or length(btrim(notes)) between 1 and 500),
  status public.expense_status not null default 'confirmed',
  -- Occurrence générée : charge d'origine de la série.
  recurrence_source_id uuid references public.expenses (id) on delete set null,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  foreign key (category_id, center_id) references public.expense_categories (id, center_id) on delete restrict,
  check (not is_recurring or recurrence_day is not null),
  check (deleted_by is null or deleted_at is not null),
  check (receipt_url is null or receipt_url like center_id::text || '/%'),
  unique (recurrence_source_id, period_year, period_month)
);

create index expenses_center_period_idx on public.expenses (center_id, period_year, period_month);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_recorded_by_idx on public.expenses (recorded_by);
create index expenses_deleted_by_idx on public.expenses (deleted_by);

-- Catégories par défaut.
create function private.create_default_expense_categories(p_center_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.expense_categories (center_id, name, icon, is_recurring, sort_order)
  values
    (p_center_id, 'Loyer', 'house', true, 1),
    (p_center_id, 'Électricité', 'zap', false, 2),
    (p_center_id, 'Eau', 'droplet', false, 3),
    (p_center_id, 'Internet', 'wifi', true, 4),
    (p_center_id, 'Ménage', 'sparkles', false, 5),
    (p_center_id, 'Fournitures', 'package', false, 6),
    (p_center_id, 'Maintenance', 'wrench', false, 7),
    (p_center_id, 'Taxes', 'landmark', false, 8),
    (p_center_id, 'Marketing', 'megaphone', false, 9),
    (p_center_id, 'Autres', 'ellipsis', false, 10)
  on conflict (center_id, name) do nothing;
$$;

create function private.centers_create_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.create_default_expense_categories(new.id);
  return null;
end;
$$;

create trigger centers_create_expense_categories
after insert on public.centers
for each row execute function private.centers_create_expense_categories();

select private.create_default_expense_categories(c.id) from public.centers c;

-- Période par défaut : mois de la dépense ; jour de récurrence par défaut :
-- jour de la dépense (28 au plus).
create function private.expenses_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.period_year := coalesce(new.period_year, extract(year from new.expense_date)::smallint);
    new.period_month := coalesce(new.period_month, extract(month from new.expense_date)::smallint);
  else
    new.recorded_by := old.recorded_by;
    new.updated_at := now();
    if old.deleted_at is not null then
      raise exception 'Cette charge a été supprimée.' using errcode = '22023';
    end if;
  end if;
  if new.is_recurring and new.recurrence_day is null then
    new.recurrence_day := least(extract(day from new.expense_date)::smallint, 28);
  end if;
  new.label := btrim(new.label);
  new.notes := nullif(btrim(new.notes), '');
  return new;
end;
$$;

create trigger expenses_before_write
before insert or update on public.expenses
for each row execute function private.expenses_before_write();

-- Suppression : retrait horodaté avec son auteur.
create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  select * into v_expense from public.expenses where id = p_expense_id and deleted_at is null for update;
  if v_expense.id is null or not private.can_read_finance(v_expense.center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.expenses
  set deleted_at = now(), deleted_by = (select auth.uid()), is_recurring = false
  where id = p_expense_id;

  perform private.log_center_event(v_expense.center_id, 'expense.deleted', v_expense.id,
    jsonb_build_object('label', v_expense.label, 'amount', v_expense.amount,
                       'period', v_expense.period_year || '-' || lpad(v_expense.period_month::text, 2, '0')));
end;
$$;

-- Récurrence : une occurrence en brouillon par mois et par série.
create function private.generate_recurring_expenses(p_date date default private.today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint := extract(year from p_date)::smallint;
  v_month smallint := extract(month from p_date)::smallint;
  v_count integer;
begin
  with series as (
    select src.*
    from public.expenses src
    where src.is_recurring and src.deleted_at is null and src.recurrence_source_id is null
      and make_date(src.period_year, src.period_month, 1) < make_date(v_year, v_month, 1)
  ),
  latest as (
    select distinct on (s.id) s.id as source_id, s.center_id, s.category_id, s.label, s.payment_method,
           s.recurrence_day, coalesce(o.amount, s.amount) as amount
    from series s
    left join public.expenses o
      on o.recurrence_source_id = s.id and o.deleted_at is null and o.status = 'confirmed'
    order by s.id, o.period_year desc nulls last, o.period_month desc nulls last
  ),
  created as (
    insert into public.expenses (center_id, category_id, label, amount, expense_date, period_year, period_month,
                                 payment_method, status, recurrence_source_id, recorded_by)
    select l.center_id, l.category_id, l.label, l.amount,
           make_date(v_year, v_month, l.recurrence_day), v_year, v_month,
           l.payment_method, 'draft', l.source_id, null
    from latest l
    where not exists (
      select 1 from public.expenses e
      where e.recurrence_source_id = l.source_id and e.period_year = v_year and e.period_month = v_month
    )
    on conflict (recurrence_source_id, period_year, period_month) do nothing
    returning 1
  )
  select count(*)::integer into v_count from created;
  return v_count;
end;
$$;

select cron.schedule(
  'centromanager-recurring-expenses',
  '20 0 * * *',
  $$select private.generate_recurring_expenses()$$
);

-- ---------------------------------------------------------------------
-- RLS : admin du centre, hors mode support ; pas de suppression directe
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy expense_categories_select_admin on public.expense_categories
for select to authenticated
using ((select private.can_read_finance(center_id)));

create policy expense_categories_insert_admin on public.expense_categories
for insert to authenticated
with check ((select private.can_read_finance(center_id)));

create policy expense_categories_update_admin on public.expense_categories
for update to authenticated
using ((select private.can_read_finance(center_id)))
with check ((select private.can_read_finance(center_id)));

create policy expenses_select_admin on public.expenses
for select to authenticated
using ((select private.can_read_finance(center_id)));

create policy expenses_insert_admin on public.expenses
for insert to authenticated
with check ((select private.can_read_finance(center_id)));

create policy expenses_update_admin on public.expenses
for update to authenticated
using ((select private.can_read_finance(center_id)))
with check ((select private.can_read_finance(center_id)));

create trigger deny_support_writes
before insert or update or delete on public.expense_categories
for each row execute function private.deny_support_writes();

create trigger deny_support_writes
before insert or update or delete on public.expenses
for each row execute function private.deny_support_writes();

revoke all on public.expense_categories, public.expenses from anon, authenticated;
grant select, insert, update on public.expense_categories, public.expenses to authenticated;

-- ---------------------------------------------------------------------
-- Justificatifs : bucket privé « expense-receipts », {center_id}/{fichier}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_select_admin on storage.objects
for select to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.can_read_finance(private.auth_center_id()))
);

create policy expense_receipts_insert_admin on storage.objects
for insert to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select private.auth_center_id())::text
  and (select private.can_read_finance(private.auth_center_id()))
  and not private.in_support_write()
);

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on function
  private.create_default_expense_categories(uuid),
  private.generate_recurring_expenses(date)
from public, anon, authenticated;
revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
