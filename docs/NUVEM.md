# Nuvem: as histórias em qualquer aparelho

## Como funciona para quem usa

- Abra o app pelo **link do claude.ai**, entrando com a **sua conta**. Nesse link, tudo o
  que é escrito, editado, excluído ou ajustado é guardado também na nuvem, sozinho.
- Em outro aparelho (celular, tablet, outro computador), abra o mesmo link com a mesma
  conta: as histórias aparecem lá, e as mudanças passam de um para o outro com o app aberto.
- No canto de baixo, à esquerda, um aviso discreto diz o estado:
  - **salvo na nuvem**: tudo guardado neste aparelho e na nuvem;
  - **salvando na nuvem…**: enviando as últimas mudanças;
  - **alterações pendentes**: sem conexão; as mudanças estão guardadas neste aparelho e
    sobem sozinhas quando a conexão voltar (mesmo que o navegador seja fechado antes);
  - **só neste aparelho**: o app foi aberto fora do link do claude.ai, ou sem conta, e
    funciona como antes, guardando só no navegador.
- Mudança na mesma história em dois aparelhos ao mesmo tempo (por exemplo, um deles sem
  internet): **nada é sobrescrito**. A versão que chegou primeiro na nuvem fica na
  história, e a outra vira uma cópia chamada "(cópia em conflito)" no Acervo. O aviso do
  canto mostra quantas cópias assim foram criadas.
- Ajustes (nome, frase da capa, letra, marcadores, onde parou a leitura) seguem a mudança
  mais recente.
- Uma história muito grande (mais de cerca de 200 mil caracteres, contando as versões
  anteriores) sobe sem as versões mais antigas; se nem assim couber, fica só no aparelho
  e o aviso do canto diz isso. O backup continua sendo o jeito de guardá-la fora dele.

## Onde fica guardado

No banco de dados do próprio link publicado no claude.ai (capacidade `db` da página),
numa área **privada de cada conta**: `data/users/<id da conta>/`. Ninguém mais lê essa
área, nem quem publicou o link. Não há senha, chave ou credencial no código: quem
autentica é o login do claude.ai, e o acesso é dado pelo próprio claude.ai à página.

```
data/users/<id>/ajustes                    os ajustes
data/users/<id>/arquivo/historias/<chave>  uma história por documento (com as versões)
data/users/<id>/arquivo/travas/<chave>     trava curta ao enviar uma história
```

Para isso a página é publicada com `capabilities: {downloads: true, db: {}, user: {}}`.

## O que continua igual

O IndexedDB do navegador continua sendo a cópia local e o lugar onde o app grava primeiro
(o app abre e salva sem internet). O banco local não mudou de formato: o HTML original
ainda lê e escreve nele. A nuvem é uma camada por cima:

1. a gravação local acontece primeiro, como antes;
2. a história fica marcada como pendente (`localStorage`, chave `arquivo-nuvem:<id>`);
3. o envio confere a revisão da nuvem; se outro aparelho mudou a mesma história nesse
   meio-tempo, cria a cópia em conflito em vez de sobrescrever;
4. o que chega da nuvem é gravado no IndexedDB antes de aparecer na tela.

**Primeira vez com um acervo que já existia:** tudo o que está no aparelho sobe para a
nuvem. Se a mesma história existir diferente nos dois lados, as duas ficam (uma como
cópia). Nada é apagado na migração. Mesmo assim, faça um backup (Acervo → backup) antes
de abrir o link pela primeira vez em cada aparelho com histórias antigas.

**Excluir de vez** (na lixeira) exclui nos outros aparelhos também. "Restaurar backup →
substituir tudo" vale como excluir de vez as histórias que não estão no backup.

## Código

- `src/data/sync.ts`: motor de sincronização (fila, pendências, revisões, conflitos,
  exclusões, ajustes, novas tentativas em 5 s, 15 s, 30 s e depois a cada minuto, e o
  evento `online` do navegador). Testado em `tests/sync.test.ts` com uma nuvem em memória.
- `src/data/cloud.ts`: adaptador para o banco do claude.ai.
- `src/state/useArchive.ts`: liga o motor ao acervo.
- `e2e/nuvem.mjs`: três navegadores separados (computador, celular, tablet) com um banco
  imitado, incluindo ficar sem internet e recarregar.

## Limites

- Só funciona pelo link do claude.ai, com login. Num site comum (Vercel, arquivo local) o
  app guarda só no aparelho, como antes. Para outro serviço de nuvem (Supabase, Firebase),
  só o adaptador `cloud.ts` muda; o motor é o mesmo.
- Quem tiver o link só para ver (sem poder interagir) não grava na nuvem: o aviso fica em
  "alterações pendentes".
- Até 25 mil documentos por link (uma história por documento).
- As mudanças chegam aos outros aparelhos com o app aberto; com ele fechado, chegam ao abrir.
