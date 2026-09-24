-- =====================================================================
-- CentroManager — 001 : extensions et types énumérés
-- =====================================================================

-- Recherche instantanée des élèves par nom (index trigramme).
create extension if not exists pg_trgm with schema extensions;
-- Contraintes d'exclusion du planning (conflits de salle et de professeur).
create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('admin', 'assistant', 'teacher');
create type public.invoice_status as enum ('pending', 'paid', 'overdue');
create type public.attendance_status as enum ('present', 'absent');
create type public.follow_up_type as enum ('payment', 'absence');
create type public.follow_up_channel as enum ('phone', 'whatsapp', 'in_person');
create type public.alert_type as enum ('consecutive_absences', 'overdue_payment');

-- Schéma privé : fonctions internes, jamais exposées par l'API REST.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Date du jour au fuseau de référence de l'application.
create function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Casablanca')::date;
$$;
