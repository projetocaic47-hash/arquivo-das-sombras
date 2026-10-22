-- Nuvem do Arquivo das Sombras (Supabase / PostgreSQL).
--
-- Cada conta (login por e-mail do Supabase Auth) tem o seu acervo, e só ela lê e grava
-- (Row Level Security). Entrar com a mesma conta em vários aparelhos = o mesmo acervo.
-- Os campos de cada história são os mesmos do IndexedDB do app (formato do HTML
-- original), guardados como estão: o JSON da história em `story` e as versões em `v`.
--
-- Concorrência: cada história tem um número de revisão. A gravação só passa pela função
-- put_historia, que confere a revisão no mesmo comando (comparar e gravar): se outro
-- aparelho gravou antes, nada é sobrescrito e o app cria uma "cópia em conflito".

create table if not exists public.historias (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  -- a história sem as versões anteriores; nula quando excluída de vez (lápide)
  story jsonb,
  -- versões anteriores
  v jsonb,
  rev integer not null check (rev > 0),
  -- aparelho que gravou por último
  dev text not null default '',
  -- quando foi gravada (ms desde 1970, relógio do aparelho)
  at bigint not null default 0,
  gone boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner, id),
  constraint historias_tamanho check (octet_length(coalesce(story::text, '')) + octet_length(coalesce(v::text, '')) < 1000000)
);

create table if not exists public.ajustes (
  owner uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cfg jsonb not null,
  at bigint not null default 0,
  dev text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.historias enable row level security;
alter table public.ajustes enable row level security;

-- ninguém sem login; com login, só as próprias linhas
revoke all on public.historias, public.ajustes from anon;
grant select, insert, update, delete on public.historias, public.ajustes to authenticated;

drop policy if exists historias_dono_le on public.historias;
drop policy if exists historias_dono_cria on public.historias;
drop policy if exists historias_dono_altera on public.historias;
drop policy if exists historias_dono_apaga on public.historias;
create policy historias_dono_le on public.historias for select to authenticated using (owner = (select auth.uid()));
create policy historias_dono_cria on public.historias for insert to authenticated with check (owner = (select auth.uid()));
create policy historias_dono_altera on public.historias for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy historias_dono_apaga on public.historias for delete to authenticated using (owner = (select auth.uid()));

drop policy if exists ajustes_dono_le on public.ajustes;
drop policy if exists ajustes_dono_cria on public.ajustes;
drop policy if exists ajustes_dono_altera on public.ajustes;
create policy ajustes_dono_le on public.ajustes for select to authenticated using (owner = (select auth.uid()));
create policy ajustes_dono_cria on public.ajustes for insert to authenticated with check (owner = (select auth.uid()));
create policy ajustes_dono_altera on public.ajustes for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- Grava uma história se a nuvem ainda estiver na revisão p_rev - 1 (ou, para p_rev = 1, se
-- ela ainda não existir). Roda com as permissões de quem chama: o RLS continua valendo.
create or replace function public.put_historia(
  p_id text, p_story jsonb, p_v jsonb, p_rev integer, p_dev text, p_at bigint, p_gone boolean
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sem login' using errcode = '42501';
  end if;
  if p_rev = 1 then
    insert into public.historias (owner, id, story, v, rev, dev, at, gone)
    values (auth.uid(), p_id, p_story, p_v, 1, p_dev, p_at, p_gone)
    on conflict (owner, id) do nothing;
  else
    update public.historias
       set story = p_story, v = p_v, rev = p_rev, dev = p_dev, at = p_at, gone = p_gone, updated_at = now()
     where owner = auth.uid() and id = p_id and rev = p_rev - 1;
  end if;
  if not found then
    raise exception 'conflito de revisão' using errcode = 'P0409';
  end if;
  return p_rev;
end;
$$;

revoke all on function public.put_historia(text, jsonb, jsonb, integer, text, bigint, boolean) from public, anon;
grant execute on function public.put_historia(text, jsonb, jsonb, integer, text, bigint, boolean) to authenticated;

-- Mudanças em tempo real para os outros aparelhos abertos (respeitando o RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'historias') then
      alter publication supabase_realtime add table public.historias;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ajustes') then
      alter publication supabase_realtime add table public.ajustes;
    end if;
  end if;
end
$$;
