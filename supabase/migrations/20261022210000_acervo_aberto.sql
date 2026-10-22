-- Acervo aberto, sem login (escolha do dono, 22/10/2026: "esse site só vai ser usado por
-- mim"). O site publicado (VITE_ACERVO_ABERTO) lê e grava o acervo de UMA conta sem
-- entrar: estas políticas deixam o papel anon (qualquer visitante do site) ler e gravar
-- só as linhas dessa conta. Outras contas continuam isoladas pelo RLS, e ninguém sem
-- login apaga linhas (excluir de vez é uma lápide gravada por put_historia).
--
-- A conta do acervo é a de acervo_aberto(). Para fechar o acervo de novo: troque o corpo
-- da função por `select null::uuid` (as políticas param de valer na hora) e volte o app ao
-- login (tire VITE_ACERVO_ABERTO do build).

create or replace function public.acervo_aberto() returns uuid
language sql
immutable
set search_path = ''
as $$ select 'e4ff59d0-791c-4ec0-b34f-2aabecadfba4'::uuid $$;

grant execute on function public.acervo_aberto() to anon, authenticated;

grant select, insert, update on public.historias, public.ajustes to anon;

drop policy if exists historias_aberto_le on public.historias;
drop policy if exists historias_aberto_cria on public.historias;
drop policy if exists historias_aberto_altera on public.historias;
create policy historias_aberto_le on public.historias for select to anon using (owner = public.acervo_aberto());
create policy historias_aberto_cria on public.historias for insert to anon with check (owner = public.acervo_aberto());
create policy historias_aberto_altera on public.historias for update to anon using (owner = public.acervo_aberto()) with check (owner = public.acervo_aberto());

drop policy if exists ajustes_aberto_le on public.ajustes;
drop policy if exists ajustes_aberto_cria on public.ajustes;
drop policy if exists ajustes_aberto_altera on public.ajustes;
create policy ajustes_aberto_le on public.ajustes for select to anon using (owner = public.acervo_aberto());
create policy ajustes_aberto_cria on public.ajustes for insert to anon with check (owner = public.acervo_aberto());
create policy ajustes_aberto_altera on public.ajustes for update to anon using (owner = public.acervo_aberto()) with check (owner = public.acervo_aberto());

-- Sem login, a gravação vai para a conta do acervo aberto (com login, para a própria).
create or replace function public.put_historia(
  p_id text, p_story jsonb, p_v jsonb, p_rev integer, p_dev text, p_at bigint, p_gone boolean
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := coalesce(auth.uid(), public.acervo_aberto());
begin
  if v_owner is null then
    raise exception 'sem login' using errcode = '42501';
  end if;
  if p_rev = 1 then
    insert into public.historias (owner, id, story, v, rev, dev, at, gone)
    values (v_owner, p_id, p_story, p_v, 1, p_dev, p_at, p_gone)
    on conflict (owner, id) do nothing;
  else
    update public.historias
       set story = p_story, v = p_v, rev = p_rev, dev = p_dev, at = p_at, gone = p_gone, updated_at = now()
     where owner = v_owner and id = p_id and rev = p_rev - 1;
  end if;
  if not found then
    raise exception 'conflito de revisão' using errcode = 'P0409';
  end if;
  return p_rev;
end;
$$;

grant execute on function public.put_historia(text, jsonb, jsonb, integer, text, bigint, boolean) to anon;
