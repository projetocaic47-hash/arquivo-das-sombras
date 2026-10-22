-- Testes do acervo aberto (sem login): o visitante só lê e grava o acervo de acervo_aberto().
\set ON_ERROR_STOP on
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
insert into auth.users select public.acervo_aberto();
insert into auth.users values (:B);

create temp table resultado (teste text, ok boolean);
grant all on resultado to authenticated, anon;

-- outra conta (com login) tem a sua história
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false);
select public.put_historia('hb', '{"id":"hb","x":"de B"}', null, 1, 'b', 1, false);

-- visitante sem login
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select public.put_historia('h1', '{"id":"h1","x":"Ação — sem login"}', null, 1, 'pc', 1, false);
select public.put_historia('h1', '{"id":"h1","x":"v2"}', null, 2, 'cel', 2, false);
insert into resultado select 'sem login grava no acervo aberto', (select story->>'x' = 'v2' from public.historias where id = 'h1');
do $$ begin
  perform public.put_historia('h1', '{"id":"h1","x":"velha"}', null, 2, 'cel', 3, false);
  insert into resultado values ('sem login: revisão velha é recusada', false);
exception when sqlstate 'P0409' then
  insert into resultado values ('sem login: revisão velha é recusada', true);
end $$;
insert into public.ajustes (owner, cfg, at, dev) values (public.acervo_aberto(), '{"n":"Acervo"}', 1, 'pc');
insert into resultado select 'sem login grava os ajustes do acervo', (select count(*) = 1 from public.ajustes);
insert into resultado select 'sem login vê só o acervo aberto', (select count(*) = 1 from public.historias);
update public.historias set story = '{"x":"invadido"}' where id = 'hb';
do $$ begin
  insert into public.historias (owner, id, story, rev) values ('bbbbbbbb-0000-0000-0000-000000000002', 'h9', '{}', 1);
  insert into resultado values ('sem login não cria linha em nome de outra conta', false);
exception when insufficient_privilege then
  insert into resultado values ('sem login não cria linha em nome de outra conta', true);
end $$;
do $$ begin
  delete from public.historias;
  insert into resultado values ('sem login não apaga linhas', false);
exception when insufficient_privilege then
  insert into resultado values ('sem login não apaga linhas', true);
end $$;

reset role;
insert into resultado select 'a outra conta continua intacta', (select story->>'x' = 'de B' from public.historias where owner = :B and id = 'hb');
insert into resultado select 'acentos preservados', (select count(*) = 1 from public.historias where id = 'h1' and owner = public.acervo_aberto());

select (case when ok then 'OK    ' else 'FALHA ' end) || teste as resultado from resultado;
select case when bool_and(ok) then 'tudo certo' else 'HÁ FALHAS' end as final from resultado;
