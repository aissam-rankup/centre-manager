-- =====================================================================
-- CentroManager — 003 : index
-- Clés étrangères + colonnes de statut et de date lues par les dashboards.
-- =====================================================================

-- profiles
create index profiles_center_id_idx on public.profiles (center_id);
create index profiles_center_role_idx on public.profiles (center_id, role) where active;

-- levels / subjects
create index levels_center_sort_idx on public.levels (center_id, sort_order);
create index subjects_center_id_idx on public.subjects (center_id);
create index subjects_level_id_idx on public.subjects (level_id);

-- teacher_assignments
create index teacher_assignments_teacher_id_idx on public.teacher_assignments (teacher_id);
create index teacher_assignments_subject_id_idx on public.teacher_assignments (subject_id);
create index teacher_assignments_level_id_idx on public.teacher_assignments (level_id);

-- students
create index students_center_id_idx on public.students (center_id);
create index students_level_id_idx on public.students (level_id);
create index students_created_by_idx on public.students (created_by);
create index students_full_name_trgm_idx on public.students using gin (full_name extensions.gin_trgm_ops);

-- enrollments
create index enrollments_student_id_idx on public.enrollments (student_id);
create index enrollments_subject_id_idx on public.enrollments (subject_id);
-- Une seule inscription active par élève et par matière.
create unique index enrollments_one_active_idx on public.enrollments (student_id, subject_id) where active;

-- invoices
create index invoices_enrollment_id_idx on public.invoices (enrollment_id);
create index invoices_student_id_idx on public.invoices (student_id);
create index invoices_paid_by_idx on public.invoices (paid_by);
create index invoices_status_due_date_idx on public.invoices (status, due_date);
create index invoices_period_start_idx on public.invoices (period_start);
create index invoices_paid_at_idx on public.invoices (paid_at) where paid_at is not null;

-- attendance
create index attendance_subject_date_idx on public.attendance (subject_id, session_date);
create index attendance_teacher_id_idx on public.attendance (teacher_id);
create index attendance_session_date_status_idx on public.attendance (session_date, status);
create index attendance_student_subject_date_idx on public.attendance (student_id, subject_id, session_date desc);

-- schedule_slots
create index schedule_slots_center_day_idx on public.schedule_slots (center_id, day_of_week, start_time);
create index schedule_slots_subject_id_idx on public.schedule_slots (subject_id);
create index schedule_slots_level_id_idx on public.schedule_slots (level_id);
create index schedule_slots_teacher_id_idx on public.schedule_slots (teacher_id, day_of_week);

-- follow_ups
create index follow_ups_student_id_idx on public.follow_ups (student_id, created_at desc);
create index follow_ups_invoice_id_idx on public.follow_ups (invoice_id);
create index follow_ups_created_by_idx on public.follow_ups (created_by);
create index follow_ups_created_at_idx on public.follow_ups (created_at);

-- alerts
create index alerts_student_id_idx on public.alerts (student_id);
create index alerts_open_idx on public.alerts (type, created_at) where not resolved;
