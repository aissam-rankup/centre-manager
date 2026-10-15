-- =====================================================================
-- Modèles de messages aux familles en arabe et en anglais
--
--  * centers.message_templates : modèles du centre dans les langues autres
--    que le français (le français garde ses colonnes) :
--    { "ar": { "receipt": "…", "absence": "…", "reminder_upcoming": "…",
--              "reminder_due_today": "…", "reminder_overdue": "…" },
--      "en": { … } } ;
--    une clé absente : message proposé par l'application dans la langue de
--    la famille. Variables enregistrées sous leur forme d'origine.
--  * Forme contrôlée par la base : langues et modèles connus, textes de
--    1 à 1 000 caractères.
-- =====================================================================

create function private.valid_message_templates(p_templates jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_templates) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_templates) as l(locale, templates)
      where l.locale not in ('ar', 'en')
        or jsonb_typeof(l.templates) <> 'object'
        or exists (
          select 1
          from jsonb_each(l.templates) as t(kind, template)
          where t.kind not in ('receipt', 'absence', 'reminder_upcoming', 'reminder_due_today', 'reminder_overdue')
            or jsonb_typeof(t.template) <> 'string'
            or length(btrim(t.template #>> '{}')) not between 1 and 1000
        )
    );
$$;

alter table public.centers
  add column message_templates jsonb not null default '{}'::jsonb
    check (private.valid_message_templates(message_templates));

comment on column public.centers.message_templates is
  'Modèles de messages aux familles en arabe et en anglais ({"ar": {"receipt": …}, "en": {…}}) ; absent : message proposé.';

grant select (message_templates) on public.centers to authenticated;
grant update (message_templates) on public.centers to authenticated;
