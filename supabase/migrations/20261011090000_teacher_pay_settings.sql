-- =====================================================================
-- CentroManager — 028 : réglage de la rémunération d'un professeur
--
-- En une transaction : mode de rémunération, salaire ou taux par matière à
-- partir d'une date. Une nouvelle ligne d'historique n'est créée que si la
-- valeur change (pas de doublon en enregistrant deux fois la même chose).
-- =====================================================================

create function public.set_teacher_pay(
  p_teacher_id uuid,
  p_pay_mode public.pay_mode,
  p_effective_from date,
  p_monthly_amount numeric default null,
  -- [{"subject_id": "…", "rate_percent": 30}, …]
  p_rates jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid := private.auth_center_id();
  v_rate record;
  v_current numeric;
begin
  if not private.can_read_finance(v_center_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_teacher_id and p.center_id = v_center_id and p.role = 'teacher'
  ) then
    raise exception 'Professeur introuvable.' using errcode = 'P0002';
  end if;
  if p_effective_from is null then
    raise exception 'Indiquez la date d''effet.' using errcode = '22023';
  end if;

  update public.profiles set pay_mode = p_pay_mode where id = p_teacher_id and pay_mode is distinct from p_pay_mode;

  if p_pay_mode = 'fixed_salary' then
    if p_monthly_amount is null or p_monthly_amount < 0 then
      raise exception 'Indiquez le salaire mensuel.' using errcode = '22023';
    end if;
    select s.monthly_amount into v_current
    from public.teacher_salaries s
    where s.teacher_id = p_teacher_id and s.effective_from <= p_effective_from
      and (s.effective_to is null or s.effective_to >= p_effective_from)
    order by s.effective_from desc
    limit 1;
    if v_current is distinct from round(p_monthly_amount, 2) then
      perform public.set_teacher_salary(p_teacher_id, p_monthly_amount, p_effective_from);
    end if;
  else
    for v_rate in
      select (x ->> 'subject_id')::uuid as subject_id, (x ->> 'rate_percent')::numeric as rate_percent
      from jsonb_array_elements(coalesce(p_rates, '[]'::jsonb)) as x
    loop
      if v_rate.rate_percent is null or v_rate.rate_percent < 0 or v_rate.rate_percent > 100 then
        raise exception 'Un taux est compris entre 0 et 100 %%.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.teacher_assignments ta
        where ta.teacher_id = p_teacher_id and ta.subject_id = v_rate.subject_id
      ) then
        raise exception 'Le professeur n''enseigne pas cette matière.' using errcode = '22023';
      end if;
      select c.rate_percent into v_current
      from public.teacher_commissions c
      where c.teacher_id = p_teacher_id and c.subject_id = v_rate.subject_id and c.effective_from <= p_effective_from
        and (c.effective_to is null or c.effective_to >= p_effective_from)
      order by c.effective_from desc
      limit 1;
      if v_current is distinct from round(v_rate.rate_percent, 2) then
        perform public.set_teacher_commission(p_teacher_id, v_rate.subject_id, v_rate.rate_percent, p_effective_from);
      end if;
    end loop;
  end if;

  perform private.log_center_event(v_center_id, 'payroll.pay_settings_changed', p_teacher_id,
    jsonb_build_object('pay_mode', p_pay_mode, 'effective_from', p_effective_from,
                       'monthly_amount', p_monthly_amount, 'rates', coalesce(p_rates, '[]'::jsonb)));
end;
$$;

revoke all on function public.set_teacher_pay(uuid, public.pay_mode, date, numeric, jsonb) from public, anon;
grant execute on function public.set_teacher_pay(uuid, public.pay_mode, date, numeric, jsonb) to authenticated;
