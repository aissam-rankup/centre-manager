-- =====================================================================
-- CentroManager — 004 : fonctions d'autorisation et intégrité métier
--
-- Les fonctions private.* sont SECURITY DEFINER : elles lisent les tables
-- sans repasser par la RLS (pas de récursion) et ne renvoient que des
-- informations sur l'utilisateur connecté. Un compte désactivé
-- (profiles.active = false) n'obtient ni centre ni rôle, donc aucun accès.
-- =====================================================================

create function private.auth_center_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.center_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

create function private.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

create function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.auth_role() = 'admin', false);
$$;

-- Admin ou assistant.
create function private.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.auth_role() in ('admin', 'assistant'), false);
$$;

create function private.student_center_id(p_student_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id from public.students s where s.id = p_student_id;
$$;

create function private.subject_center_id(p_subject_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id from public.subjects s where s.id = p_subject_id;
$$;

-- Le professeur connecté enseigne-t-il cette matière ?
create function private.teaches_subject(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_role() = 'teacher'
    and exists (
      select 1
      from public.teacher_assignments ta
      where ta.teacher_id = (select auth.uid())
        and ta.subject_id = p_subject_id
    );
$$;

-- L'élève est-il inscrit (inscription active) à une matière du professeur connecté ?
create function private.teacher_sees_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_role() = 'teacher'
    and exists (
      select 1
      from public.enrollments e
      join public.teacher_assignments ta on ta.subject_id = e.subject_id
      where e.student_id = p_student_id
        and e.active
        and ta.teacher_id = (select auth.uid())
    );
$$;

create function private.is_enrolled(p_student_id uuid, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.student_id = p_student_id
      and e.subject_id = p_subject_id
      and e.active
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Triggers d'intégrité
-- ---------------------------------------------------------------------

-- Inscriptions : élève et matière du même centre ; prix par défaut = tarif
-- de la matière ; seul un administrateur peut fixer un prix différent.
create function private.enrollments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_price numeric(10, 2);
  v_subject_center uuid;
begin
  select s.monthly_price, s.center_id
    into v_subject_price, v_subject_center
  from public.subjects s
  where s.id = new.subject_id;

  if v_subject_center is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;

  if new.price_agreed is null then
    new.price_agreed := v_subject_price;
  end if;

  if private.auth_role() = 'assistant' and new.price_agreed <> v_subject_price then
    raise exception 'Seul un administrateur peut fixer un tarif.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger enrollments_before_write
before insert or update of student_id, subject_id, price_agreed on public.enrollments
for each row execute function private.enrollments_before_write();

-- Affectations : le compte doit être un professeur du même centre que la matière.
create function private.teacher_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.teacher_id
      and p.role = 'teacher'
      and p.center_id = private.subject_center_id(new.subject_id)
  ) then
    raise exception 'Le compte affecté doit être un professeur du même centre que la matière.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teacher_assignments_before_write
before insert or update on public.teacher_assignments
for each row execute function private.teacher_assignments_before_write();

-- Créneaux : le compte doit être un professeur.
create function private.schedule_slots_before_write()
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
  return new;
end;
$$;

create trigger schedule_slots_before_write
before insert or update of teacher_id on public.schedule_slots
for each row execute function private.schedule_slots_before_write();

-- Présences : élève et matière du même centre.
create function private.attendance_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.subject_center_id(new.subject_id) is distinct from private.student_center_id(new.student_id) then
    raise exception 'L''élève et la matière doivent appartenir au même centre.'
      using errcode = '23514';
  end if;
  -- Horodatage serveur pour toute saisie faite par un utilisateur connecté.
  if (select auth.uid()) is not null then
    new.marked_at := now();
  end if;
  return new;
end;
$$;

create trigger attendance_before_write
before insert or update on public.attendance
for each row execute function private.attendance_before_write();

-- Factures : un assistant ne modifie que les colonnes de paiement
-- (amount_paid, status, paid_at, paid_by).
create function private.invoices_guard_assistant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.auth_role() = 'assistant' and (
    new.enrollment_id is distinct from old.enrollment_id
    or new.student_id is distinct from old.student_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.amount_due is distinct from old.amount_due
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Un assistant ne peut modifier que les informations de paiement d''une facture.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger invoices_guard_assistant_update
before update on public.invoices
for each row execute function private.invoices_guard_assistant_update();
