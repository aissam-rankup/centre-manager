-- =====================================================================
-- CentroManager — 048 : derniers correctifs, suite de la revue (page 8)
--
--  * Modèles de message : quand le vocabulaire d'un centre change (type de
--    centre ou termes personnalisés), ses modèles enregistrés passent à la
--    forme d'origine des variables avec l'ancien vocabulaire ; ils restent
--    valables (y compris ceux enregistrés avant cette règle).
--  * Campagne confirmée : une intention ne reçoit plus d'auteur après la
--    confirmation ; une ligne ne se rattache qu'à une facture de la même
--    inscription (ou du même pack), de cette campagne.
-- =====================================================================

-- Variables d'un modèle, du vocabulaire donné vers la forme d'origine.
-- Une variable s'écrit « [terme] », terme en minuscule initiale, comme dans
-- src/lib/vocabulary.ts (word().one / word().many).
create function private.canonical_template(p_text text, p_terms jsonb, p_kind text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_text;
  v_pair record;
  v_term text;
begin
  if p_text is null then
    return null;
  end if;
  for v_pair in
    select * from (values
      ('learner', 'singular', '[élève]', array['reminder', 'absence', 'receipt']),
      ('course', 'plural', '[matières]', array['reminder']),
      ('course', 'singular', '[matière]', array['absence']),
      ('instructor', 'singular', '[professeur]', array['absence'])
    ) as t(term_key, form, canonical, kinds)
    where p_kind = any(t.kinds)
  loop
    v_term := btrim(p_terms -> v_pair.term_key ->> v_pair.form);
    if v_term is not null and v_term <> '' then
      v_text := replace(v_text, '[' || lower(left(v_term, 1)) || substr(v_term, 2) || ']', v_pair.canonical);
    end if;
  end loop;
  return v_text;
end;
$$;

create function private.centers_canonical_templates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if new.center_type is distinct from old.center_type or new.custom_terms is distinct from old.custom_terms then
    v_old := coalesce((select ty.terms from public.center_types ty where ty.code = old.center_type), '{}'::jsonb)
             || coalesce(old.custom_terms, '{}'::jsonb);
    new.reminder_template_upcoming := private.canonical_template(new.reminder_template_upcoming, v_old, 'reminder');
    new.reminder_template_due_today := private.canonical_template(new.reminder_template_due_today, v_old, 'reminder');
    new.reminder_template_overdue := private.canonical_template(new.reminder_template_overdue, v_old, 'reminder');
    new.absence_notification_template := private.canonical_template(new.absence_notification_template, v_old, 'absence');
    new.receipt_whatsapp_template := private.canonical_template(new.receipt_whatsapp_template, v_old, 'receipt');
  end if;
  return new;
end;
$$;

create trigger centers_canonical_templates
before update of center_type, custom_terms on public.centers
for each row execute function private.centers_canonical_templates();

-- ---------------------------------------------------------------------
-- Lignes et intentions d'une campagne confirmée
-- ---------------------------------------------------------------------
create or replace function private.billing_run_children_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_status public.billing_run_status;
  v_new_status public.billing_run_status;
  v_free text[] := case tg_table_name
    when 'billing_run_lines' then array['invoice_id', 'discount_id', 'stopped_at']
    else array['applied_at', 'decided_by']
  end;
  v_link text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select br.status into v_old_status from public.billing_runs br where br.id = old.billing_run_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select br.status into v_new_status from public.billing_runs br where br.id = new.billing_run_id;
  end if;

  -- Une ligne ne se rattache qu'à la facture de sa propre inscription (ou de
  -- son pack), émise pour cette campagne (les factures n'ont pas de centre).
  if tg_table_name = 'billing_run_lines' and tg_op in ('INSERT', 'UPDATE')
     and (to_jsonb(new) ->> 'invoice_id') is not null
     and (tg_op = 'INSERT' or (to_jsonb(new) ->> 'invoice_id') is distinct from (to_jsonb(old) ->> 'invoice_id'))
     and not exists (
       select 1 from public.invoices i
       where i.id = (to_jsonb(new) ->> 'invoice_id')::uuid
         and i.student_id = new.student_id
         and i.enrollment_id is not distinct from (to_jsonb(new) ->> 'enrollment_id')::uuid
         and i.pack_enrollment_id is not distinct from (to_jsonb(new) ->> 'pack_enrollment_id')::uuid
         and (i.billing_run_id is null or i.billing_run_id = new.billing_run_id)
     ) then
    raise exception 'Une ligne de campagne ne se rattache qu''à la facture de sa propre inscription.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if v_new_status is not null and v_new_status <> 'draft' then
      raise exception 'Campagne confirmée : aucune ligne ne s''y ajoute.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old_status is null or v_old_status = 'draft'
       or not exists (select 1 from public.students st where st.id = old.student_id)
       or (tg_table_name = 'billing_run_lines' and not exists (
             select 1 from public.enrollments e where e.id = (to_jsonb(old) ->> 'enrollment_id')::uuid
             union all
             select 1 from public.pack_enrollments pe where pe.id = (to_jsonb(old) ->> 'pack_enrollment_id')::uuid)) then
      return old;
    end if;
    raise exception 'Campagne confirmée : ses lignes ne se suppriment pas.' using errcode = '42501';
  end if;

  if new.billing_run_id is distinct from old.billing_run_id
     and (coalesce(v_old_status, 'draft') <> 'draft' or coalesce(v_new_status, 'draft') <> 'draft') then
    raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
  end if;
  if v_old_status is not null and v_old_status <> 'draft' then
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
    end if;
    -- Auteur, remise et facture : posés une fois, seulement effacés ensuite
    -- (suppression du compte, de la remise ou de la facture), jamais réattribués.
    foreach v_link in array array['decided_by', 'discount_id', 'invoice_id'] loop
      if (to_jsonb(old) ->> v_link) is not null and (to_jsonb(new) ->> v_link) is not null
         and (to_jsonb(new) ->> v_link) <> (to_jsonb(old) ->> v_link) then
        raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
      end if;
    end loop;
    -- Ni remise, ni auteur ajoutés après la confirmation (la facture, elle,
    -- se rattache à sa ligne quand elle est émise).
    foreach v_link in array array['decided_by', 'discount_id'] loop
      if (to_jsonb(old) ->> v_link) is null and (to_jsonb(new) ->> v_link) is not null then
        raise exception 'Campagne confirmée : ses lignes sont figées.' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

comment on function public.payment_reminder_queue(uuid, uuid) is
  'Rappels de paiement à envoyer (campagnes confirmées) : par élève et par échéance, vague du jour, dernier rappel. '
  'Une relance de paiement notée depuis le suivi (qui porte sur tous les impayés de l''élève) depuis le début du retard '
  'vaut un rappel de la vague « en retard ».';
