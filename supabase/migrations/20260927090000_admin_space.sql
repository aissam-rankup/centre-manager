-- =====================================================================
-- CentroManager — 010 : espace Admin
--
-- Définitions retenues :
--  * revenu attendu du mois = montants dus des factures dont la période
--    commence dans le mois civil en cours (cycles du 1er et du 15) ;
--  * revenu encaissé = montants payés sur ces mêmes factures ;
--  * taux d'absence = absences / présences saisies, sur une fenêtre glissante.
--
-- Fonctions réservées à l'administrateur (vérification explicite), en
-- « security invoker » : la RLS s'applique en plus.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planning : le professeur d'un créneau doit enseigner la matière.
-- ---------------------------------------------------------------------
create or replace function private.schedule_slots_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.teacher_id and p.role = 'teacher') then
    raise exception 'Un créneau doit être assigné à un professeur.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = new.teacher_id and ta.subject_id = new.subject_id
  ) then
    raise exception 'Ce professeur n''enseigne pas cette matière.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger schedule_slots_before_write on public.schedule_slots;
create trigger schedule_slots_before_write
before insert or update of teacher_id, subject_id on public.schedule_slots
for each row execute function private.schedule_slots_before_write();

-- ---------------------------------------------------------------------
-- Cohérence niveau / inscriptions : un élève ne suit activement que des
-- matières de son niveau. Pour changer de niveau, on arrête d'abord ses
-- inscriptions (l'historique des factures et présences est conservé).
-- ---------------------------------------------------------------------
create function private.enrollments_level_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active and not exists (
    select 1
    from public.students st
    join public.subjects su on su.level_id = st.level_id
    where st.id = new.student_id and su.id = new.subject_id
  ) then
    raise exception 'Cette matière n''appartient pas au niveau de l''élève.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enrollments_level_check
before insert or update of student_id, subject_id, active on public.enrollments
for each row execute function private.enrollments_level_check();

create function private.students_level_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.enrollments e
    join public.subjects su on su.id = e.subject_id
    where e.student_id = new.id and e.active and su.level_id <> new.level_id
  ) then
    raise exception 'Pour changer de niveau, arrêtez d''abord les inscriptions de l''élève à son niveau actuel.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger students_level_check
before update of level_id on public.students
for each row
when (new.level_id is distinct from old.level_id)
execute function private.students_level_check();

-- ---------------------------------------------------------------------
-- Profils : pas d'auto-verrouillage, rôle professeur figé.
-- ---------------------------------------------------------------------
create function private.profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid()) and (not new.active or new.role is distinct from old.role) then
    raise exception 'Vous ne pouvez ni désactiver votre propre compte, ni changer votre rôle.'
      using errcode = '23514';
  end if;
  -- Un professeur porte des affectations et des créneaux : son rôle ne change pas.
  if new.role is distinct from old.role and (old.role = 'teacher' or new.role = 'teacher') then
    raise exception 'Le rôle professeur ne peut pas être attribué ni retiré à un compte existant.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profiles_before_update
before update on public.profiles
for each row execute function private.profiles_before_update();

-- ---------------------------------------------------------------------
-- Indicateurs du mois
-- ---------------------------------------------------------------------
create function public.admin_month_revenue(p_level_id uuid default null)
returns table (
  month_start date,
  expected_amount numeric,
  collected_amount numeric,
  invoice_count integer,
  paid_count integer,
  student_count integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', private.today()::timestamp)::date;
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    v_month,
    coalesce(sum(i.amount_due), 0)::numeric,
    coalesce(sum(i.amount_paid), 0)::numeric,
    count(i.id)::integer,
    (count(i.id) filter (where i.status = 'paid'))::integer,
    (select count(*)::integer from public.students s where p_level_id is null or s.level_id = p_level_id)
  from public.invoices i
  join public.students st on st.id = i.student_id
  where i.period_start >= v_month
    and i.period_start < (v_month + interval '1 month')::date
    and (p_level_id is null or st.level_id = p_level_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Taux d'absence par matière (p_days : fenêtre glissante ; null = tout)
-- ---------------------------------------------------------------------
create function public.admin_absence_rates(p_level_id uuid default null, p_days integer default 30)
returns table (
  subject_id uuid,
  subject_name text,
  level_id uuid,
  level_name text,
  level_sort integer,
  absent_count integer,
  total_count integer,
  absence_rate numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.name,
    l.id,
    l.name,
    l.sort_order,
    (count(a.id) filter (where a.status = 'absent'))::integer,
    count(a.id)::integer,
    case
      when count(a.id) = 0 then 0::numeric
      else round((count(a.id) filter (where a.status = 'absent'))::numeric / count(a.id), 4)
    end
  from public.subjects s
  join public.levels l on l.id = s.level_id
  left join public.attendance a
    on a.subject_id = s.id
   and a.session_date <= private.today()
   and (p_days is null or a.session_date > private.today() - p_days)
  where p_level_id is null or s.level_id = p_level_id
  group by s.id, s.name, l.id, l.name, l.sort_order;
end;
$$;

-- ---------------------------------------------------------------------
-- Effectifs par niveau et par matière
-- ---------------------------------------------------------------------
create function public.admin_enrollment_report()
returns table (
  level_id uuid,
  level_name text,
  level_sort integer,
  level_students integer,
  subject_id uuid,
  subject_name text,
  monthly_price numeric,
  active_enrollments integer,
  agreed_revenue numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.name,
    l.sort_order,
    (select count(*)::integer from public.students st where st.level_id = l.id),
    s.id,
    s.name,
    s.monthly_price,
    (select count(*)::integer from public.enrollments e where e.subject_id = s.id and e.active),
    -- Revenu mensuel réel des inscriptions actives : somme des prix convenus (remises incluses).
    (select coalesce(sum(e.price_agreed), 0) from public.enrollments e where e.subject_id = s.id and e.active)
  from public.levels l
  left join public.subjects s on s.level_id = l.id
  order by l.sort_order, l.name, s.name;
end;
$$;

-- ---------------------------------------------------------------------
-- Annuaire des comptes du centre (avec email, lu dans auth.users)
-- ---------------------------------------------------------------------
create function public.admin_list_users()
returns table (
  id uuid,
  full_name text,
  role public.user_role,
  phone text,
  active boolean,
  created_at timestamptz,
  email text,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.role, p.phone, p.active, p.created_at, u.email::text, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.center_id = private.auth_center_id()
  order by p.active desc, p.role, p.full_name;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilèges
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.admin_month_revenue(uuid) from public, anon;
revoke execute on function public.admin_absence_rates(uuid, integer) from public, anon;
revoke execute on function public.admin_enrollment_report() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_month_revenue(uuid) to authenticated;
grant execute on function public.admin_absence_rates(uuid, integer) to authenticated;
grant execute on function public.admin_enrollment_report() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
