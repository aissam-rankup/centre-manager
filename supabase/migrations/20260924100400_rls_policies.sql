-- =====================================================================
-- CentroManager — 005 : Row Level Security
--
-- Règles :
--  * Tout est cloisonné par centre (private.auth_center_id()).
--  * ADMIN     : lecture et écriture sur tout son centre ; seul rôle à faire
--                UPDATE / DELETE sur students, subjects, levels, profiles,
--                schedule_slots ; seul rôle à fixer les tarifs.
--  * ASSISTANT : SELECT sur son centre ; INSERT students, enrollments,
--                follow_ups, comptes teacher (+ affectations) ; UPDATE des
--                colonnes de paiement des invoices (trigger dédié).
--  * TEACHER   : SELECT des élèves inscrits à ses matières ; INSERT / UPDATE
--                attendance pour ses matières et la date du jour ; SELECT de
--                ses propres créneaux ; aucun accès aux factures ni aux prix.
--  * anon      : aucun accès (aucune policy « to anon »).
--
-- Les appels sont enveloppés dans (select …) pour être évalués une seule
-- fois par requête et non une fois par ligne.
-- =====================================================================

-- ---------------------------------------------------------------------
-- centers
-- ---------------------------------------------------------------------
create policy centers_select on public.centers
for select to authenticated
using (id = (select private.auth_center_id()));

create policy centers_update_admin on public.centers
for update to authenticated
using (id = (select private.auth_center_id()) and (select private.is_admin()))
with check (id = (select private.auth_center_id()));

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
-- Chacun lit son propre profil (y compris désactivé, pour afficher le motif
-- du refus d'accès) ; admin et assistant lisent les profils de leur centre.
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (center_id = (select private.auth_center_id()) and (select private.is_staff()))
);

create policy profiles_insert on public.profiles
for insert to authenticated
with check (
  center_id = (select private.auth_center_id())
  and (
    (select private.is_admin())
    or ((select private.auth_role()) = 'assistant' and role = 'teacher')
  )
);

create policy profiles_update_admin on public.profiles
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy profiles_delete_admin on public.profiles
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- levels (aucun prix : lisibles par tous les rôles du centre)
-- ---------------------------------------------------------------------
create policy levels_select on public.levels
for select to authenticated
using (center_id = (select private.auth_center_id()));

create policy levels_insert_admin on public.levels
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy levels_update_admin on public.levels
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy levels_delete_admin on public.levels
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- subjects (contient monthly_price : admin et assistant uniquement ;
-- les professeurs passent par la vue public.subject_catalog, sans prix)
-- ---------------------------------------------------------------------
create policy subjects_select_staff on public.subjects
for select to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_staff()));

create policy subjects_insert_admin on public.subjects
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy subjects_update_admin on public.subjects
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy subjects_delete_admin on public.subjects
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- teacher_assignments
-- ---------------------------------------------------------------------
create policy teacher_assignments_select on public.teacher_assignments
for select to authenticated
using (
  teacher_id = (select auth.uid()) and (select private.auth_role()) = 'teacher'
  or (
    (select private.is_staff())
    and private.subject_center_id(subject_id) = (select private.auth_center_id())
  )
);

-- L'assistant affecte les matières lors de la création d'un professeur.
create policy teacher_assignments_insert_staff on public.teacher_assignments
for insert to authenticated
with check (
  (select private.is_staff())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
);

create policy teacher_assignments_update_admin on public.teacher_assignments
for update to authenticated
using (
  (select private.is_admin())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
)
with check (private.subject_center_id(subject_id) = (select private.auth_center_id()));

create policy teacher_assignments_delete_admin on public.teacher_assignments
for delete to authenticated
using (
  (select private.is_admin())
  and private.subject_center_id(subject_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------
create policy students_select on public.students
for select to authenticated
using (
  (center_id = (select private.auth_center_id()) and (select private.is_staff()))
  or private.teacher_sees_student(id)
);

create policy students_insert_staff on public.students
for insert to authenticated
with check (
  center_id = (select private.auth_center_id())
  and (select private.is_staff())
  and created_by = (select auth.uid())
);

create policy students_update_admin on public.students
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy students_delete_admin on public.students
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- enrollments (contient price_agreed : admin et assistant uniquement ;
-- les professeurs passent par la vue public.class_rosters, sans prix)
-- ---------------------------------------------------------------------
create policy enrollments_select_staff on public.enrollments
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy enrollments_insert_staff on public.enrollments
for insert to authenticated
with check (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy enrollments_update_admin on public.enrollments
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy enrollments_delete_admin on public.enrollments
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- invoices (aucun accès professeur)
-- ---------------------------------------------------------------------
create policy invoices_select_staff on public.invoices
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy invoices_insert_admin on public.invoices
for insert to authenticated
with check (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- Assistant : restreint aux colonnes de paiement par le trigger
-- private.invoices_guard_assistant_update.
create policy invoices_update_staff on public.invoices
for update to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy invoices_delete_admin on public.invoices
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------
create policy attendance_select on public.attendance
for select to authenticated
using (
  (
    (select private.is_staff())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or private.teaches_subject(subject_id)
);

create policy attendance_insert on public.attendance
for insert to authenticated
with check (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (
    private.teaches_subject(subject_id)
    and private.is_enrolled(student_id, subject_id)
    and teacher_id = (select auth.uid())
    and session_date = (select private.today())
  )
);

create policy attendance_update on public.attendance
for update to authenticated
using (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (private.teaches_subject(subject_id) and session_date = (select private.today()))
)
with check (
  (
    (select private.is_admin())
    and private.student_center_id(student_id) = (select private.auth_center_id())
  )
  or (
    private.teaches_subject(subject_id)
    and private.is_enrolled(student_id, subject_id)
    and teacher_id = (select auth.uid())
    and session_date = (select private.today())
  )
);

create policy attendance_delete_admin on public.attendance
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- schedule_slots
-- ---------------------------------------------------------------------
-- Le professeur voit automatiquement ses propres créneaux.
create policy schedule_slots_select on public.schedule_slots
for select to authenticated
using (
  (center_id = (select private.auth_center_id()) and (select private.is_staff()))
  or (teacher_id = (select auth.uid()) and (select private.auth_role()) = 'teacher')
);

create policy schedule_slots_insert_admin on public.schedule_slots
for insert to authenticated
with check (center_id = (select private.auth_center_id()) and (select private.is_admin()));

create policy schedule_slots_update_admin on public.schedule_slots
for update to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()))
with check (center_id = (select private.auth_center_id()));

create policy schedule_slots_delete_admin on public.schedule_slots
for delete to authenticated
using (center_id = (select private.auth_center_id()) and (select private.is_admin()));

-- ---------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------
create policy follow_ups_select_staff on public.follow_ups
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy follow_ups_insert_staff on public.follow_ups
for insert to authenticated
with check (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
  and created_by = (select auth.uid())
);

create policy follow_ups_update_admin on public.follow_ups
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy follow_ups_delete_admin on public.follow_ups
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- alerts (créées et résolues automatiquement en phase 7)
-- ---------------------------------------------------------------------
create policy alerts_select_staff on public.alerts
for select to authenticated
using (
  (select private.is_staff())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

create policy alerts_update_admin on public.alerts
for update to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
)
with check (private.student_center_id(student_id) = (select private.auth_center_id()));

create policy alerts_delete_admin on public.alerts
for delete to authenticated
using (
  (select private.is_admin())
  and private.student_center_id(student_id) = (select private.auth_center_id())
);

-- ---------------------------------------------------------------------
-- Privilèges : anon n'a aucun droit sur les tables applicatives.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
