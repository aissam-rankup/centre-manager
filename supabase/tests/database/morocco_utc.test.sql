-- =====================================================================
-- Heure du Maroc : UTC+0 depuis le 20/09/2026 01:00 UTC, UTC+1 avant
-- (quelle que soit la version des fuseaux de PostgreSQL).
-- Exécuter avec : npm run db:test
-- =====================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select is(private.local_time('2026-10-12 22:39:00+00'), '2026-10-12 22:39:00'::timestamp, 'après la bascule : heure GMT');
select is(private.local_time('2026-10-12 23:30:00+00')::date, '2026-10-12'::date, 'après la bascule : le jour change à minuit, pas à 23 h');
select is(private.local_time('2026-06-15 10:00:00+00'), '2026-06-15 11:00:00'::timestamp, 'avant la bascule : UTC+1 (historique)');
select is(private.local_time('2026-09-20 00:59:00+00'), '2026-09-20 01:59:00'::timestamp, 'dernière minute en UTC+1');
select is(private.local_time('2026-09-20 01:00:00+00'), '2026-09-20 01:00:00'::timestamp, 'première minute en GMT');
select is(private.local_to_utc('2026-10-13 00:00:00'), '2026-10-13 00:00:00+00'::timestamptz, 'jour local → instant (GMT)');
select is(private.local_to_utc('2026-06-15 00:00:00'), '2026-06-14 23:00:00+00'::timestamptz, 'jour local → instant (UTC+1, historique)');
select is(private.today(), (now() at time zone 'UTC')::date, 'aujourd''hui : date GMT');

select * from finish();
rollback;
