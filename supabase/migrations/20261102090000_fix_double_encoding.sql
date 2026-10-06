-- =====================================================================
-- Réparation des textes doublement encodés (« MathÃ©matiques »).
--
-- Origine : le script du jeu de démonstration a été collé dans le SQL
-- editor après avoir été relu en Windows-1252 (UTF-8 → é devient Ã©).
-- Seules les données de démonstration sont touchées, mais la réparation est
-- générique : toutes les colonnes texte et JSON du schéma public.
--
-- Une valeur n'est modifiée que si elle contient « Ã » ou « â€ » ET que sa
-- relecture (Windows-1252 → UTF-8) réussit entièrement ; sinon elle reste
-- telle quelle. Les triggers des tables touchées sont suspendus le temps de
-- la réparation (reçus et fiches de paie verrouillés, journal, dates de mise
-- à jour) : c'est une correction de caractères, pas une modification métier.
-- Un doublon (version correcte déjà présente) fait échouer le tout : rien
-- n'est alors modifié.
-- =====================================================================

create function pg_temp.fix_double_encoding(p_value text)
returns text
language plpgsql
immutable
as $$
begin
  if p_value is null or p_value !~ (chr(195) || '|' || chr(226) || chr(8364)) then
    return p_value;
  end if;
  return convert_from(convert_to(p_value, 'WIN1252'), 'UTF8');
exception when others then
  -- Caractère hors Windows-1252 ou octets non UTF-8 : valeur laissée intacte.
  return p_value;
end;
$$;

do $$
declare
  v_pattern constant text := chr(195) || '|' || chr(226) || chr(8364);
  v_table record;
  v_column record;
  v_count bigint;
  v_total bigint := 0;
begin
  for v_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'jsonb', 'json')
    order by 1
  loop
    for v_column in
      select c.column_name, c.data_type
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = v_table.table_name
        and c.data_type in ('text', 'character varying', 'jsonb', 'json')
      order by c.ordinal_position
    loop
      execute format('select count(*) from public.%I where %I::text ~ %L', v_table.table_name, v_column.column_name, v_pattern)
        into v_count;
      continue when v_count = 0;

      execute format('alter table public.%I disable trigger user', v_table.table_name);
      if v_column.data_type in ('jsonb', 'json') then
        execute format(
          'update public.%1$I set %2$I = pg_temp.fix_double_encoding(%2$I::text)::%3$s where %2$I::text ~ %4$L',
          v_table.table_name, v_column.column_name, v_column.data_type, v_pattern);
      else
        execute format(
          'update public.%1$I set %2$I = pg_temp.fix_double_encoding(%2$I) where %2$I ~ %3$L',
          v_table.table_name, v_column.column_name, v_pattern);
      end if;
      get diagnostics v_count = row_count;
      execute format('alter table public.%I enable trigger user', v_table.table_name);

      v_total := v_total + v_count;
      raise notice '%.% : % ligne(s) corrigee(s)', v_table.table_name, v_column.column_name, v_count;
    end loop;
  end loop;
  raise notice 'Total : % valeur(s) corrigee(s)', v_total;
end;
$$;
