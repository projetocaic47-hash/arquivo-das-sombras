-- Testes da migração: RLS (cada conta só vê e grava o seu) e gravação com revisão.
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
insert into auth.users values (:A), (:B);

create temp table resultado (teste text, ok boolean);
grant all on resultado to authenticated, anon;

-- conta A grava a história h1 (revisão 1) e depois a revisão 2
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select public.put_historia('h1', '{"id":"h1","t":"Título","x":"Texto com acentuação — e travessão."}', '[{"t":"v","x":"antes","u":1}]', 1, 'pc', 1, false);
select public.put_historia('h1', '{"id":"h1","t":"Título","x":"Texto 2"}', null, 2, 'pc', 2, false);
insert into resultado select 'A lê a própria história, revisão 2', (select rev = 2 and story->>'x' = 'Texto 2' from public.historias where id = 'h1');

-- revisão velha (resposta atrasada / outro aparelho) não sobrescreve
do $$ begin
  perform public.put_historia('h1', '{"id":"h1","x":"velha"}', null, 2, 'cel', 3, false);
  insert into resultado values ('revisão repetida é recusada', false);
exception when sqlstate 'P0409' then
  insert into resultado values ('revisão repetida é recusada', true);
end $$;
do $$ begin
  perform public.put_historia('h1', '{"id":"h1","x":"nova demais"}', null, 1, 'cel', 3, false);
  insert into resultado values ('criar de novo o que já existe é recusado', false);
exception when sqlstate 'P0409' then
  insert into resultado values ('criar de novo o que já existe é recusado', true);
end $$;
insert into resultado select 'conteúdo intacto depois das recusas', (select story->>'x' = 'Texto 2' from public.historias where id = 'h1');
insert into public.ajustes (cfg, at, dev) values ('{"n":"Acervo A"}', 1, 'pc');

-- conta B não vê nem altera nada de A
select set_config('request.jwt.claim.sub', :B, false);
insert into resultado select 'B não vê as histórias de A', (select count(*) = 0 from public.historias);
insert into resultado select 'B não vê os ajustes de A', (select count(*) = 0 from public.ajustes);
update public.historias set story = '{"x":"invadido"}' where id = 'h1';
delete from public.historias where id = 'h1';
do $$ begin
  perform public.put_historia('h1', '{"id":"h1","x":"de B"}', null, 3, 'b', 9, false);
  insert into resultado values ('B não grava por cima de A pela função', false);
exception when sqlstate 'P0409' then
  insert into resultado values ('B não grava por cima de A pela função', true);
end $$;
do $$ begin
  insert into public.historias (owner, id, story, rev) values ('aaaaaaaa-0000-0000-0000-000000000001', 'h9', '{}', 1);
  insert into resultado values ('B não cria linha em nome de A', false);
exception when insufficient_privilege then
  insert into resultado values ('B não cria linha em nome de A', true);
end $$;
-- B pode ter uma h1 própria, separada
select public.put_historia('h1', '{"id":"h1","x":"de B"}', null, 1, 'b', 9, false);

-- sem login (anon): nada
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  perform count(*) from public.historias;
  insert into resultado values ('sem login não lê a tabela', false);
exception when insufficient_privilege then
  insert into resultado values ('sem login não lê a tabela', true);
end $$;
do $$ begin
  perform public.put_historia('x', '{}', null, 1, 'z', 0, false);
  insert into resultado values ('sem login não grava pela função', false);
exception when insufficient_privilege then
  insert into resultado values ('sem login não grava pela função', true);
end $$;

reset role;
insert into resultado select 'A continua com a sua h1 intacta', (select story->>'x' = 'Texto 2' and rev = 2 from public.historias where owner = :A and id = 'h1');
insert into resultado select 'B tem a sua h1 separada', (select story->>'x' = 'de B' from public.historias where owner = :B and id = 'h1');
insert into resultado select 'acentos e travessão preservados', (select story->>'x' from public.historias where owner = :A and id = 'h1') = 'Texto 2'
  and (select count(*) from public.historias) = 2;

select (case when ok then 'OK    ' else 'FALHA ' end) || teste as resultado from resultado;
select case when bool_and(ok) then 'tudo certo' else 'HÁ FALHAS' end as final from resultado;
