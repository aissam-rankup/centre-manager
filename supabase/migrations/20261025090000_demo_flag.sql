-- =====================================================================
-- CentroManager — 049 : indicateur de données de démonstration
--
-- Chaque table du schéma public reçoit is_demo (faux par défaut). Pendant
-- un seed de démonstration, la transaction pose
--   select set_config('centromanager.demo_seed', 'true', true);
-- et toutes les lignes créées, y compris par les déclencheurs (factures,
-- salles, alertes, journal…), sont marquées : elles se suppriment d'un coup.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in select t.tablename from pg_tables t where t.schemaname = 'public' order by 1 loop
    execute format(
      'alter table public.%I add column if not exists is_demo boolean not null default '
      || 'coalesce(nullif(current_setting(''centromanager.demo_seed'', true), '''')::boolean, false)',
      r.tablename);
  end loop;
end;
$$;
