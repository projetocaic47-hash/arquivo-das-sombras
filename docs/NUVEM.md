# Nuvem: as histórias em qualquer aparelho

O app tem duas nuvens possíveis, escolhidas sozinhas pelo endereço em que ele é aberto:

| Onde o app abre | Nuvem | Conta |
| --- | --- | --- |
| Site publicado (Vercel, GitHub Pages) com o Supabase configurado | **Supabase** (PostgreSQL) | e-mail (link ou código enviado por e-mail) |
| Link do claude.ai | banco do próprio link (capacidade `db`) | conta do claude.ai |
| Sem nenhuma das duas | nenhuma: só neste aparelho | — |

As duas usam o mesmo motor de sincronização (`src/data/sync.ts`). São nuvens separadas:
o acervo do site publicado não é o mesmo do link do claude.ai.

## Como funciona para quem usa (site publicado)

1. Abra o site. No canto, o aviso **"entrar para salvar na nuvem"** (ou Ajustes → Nuvem).
2. Digite o seu e-mail e toque em **enviar link de acesso**. Chega um e-mail: toque no
   link (neste aparelho) ou digite o código que veio nele.
3. Pronto: as histórias que já estavam neste aparelho sobem para a nuvem (sem apagar nada)
   e as que estão na nuvem aparecem aqui.
4. No celular ou em outro computador, entre com **o mesmo e-mail**: aparece o mesmo acervo.
   A sessão fica guardada no navegador; não é preciso entrar de novo a cada visita.

O aviso do canto (e a linha de baixo do editor) diz o estado, sempre depois da resposta da
nuvem:

- **salvo na nuvem**: a nuvem confirmou;
- **salvando na nuvem…**: enviando;
- **alterações pendentes**: esperando a nuvem; as mudanças estão guardadas neste aparelho
  e sobem sozinhas quando ela responder, mesmo que o navegador seja fechado antes;
- **erro ao salvar na nuvem · tentando de novo**: a última tentativa falhou (sem internet,
  sessão expirada, serviço fora); novas tentativas em 5 s, 15 s, 30 s e depois a cada
  minuto, e na hora em que a conexão volta;
- **entrar para salvar na nuvem**: ninguém conectado neste navegador; guarda só aqui;
- **só neste aparelho**: a nuvem não está configurada neste endereço.

**Mesma história mudada em dois aparelhos ao mesmo tempo:** nada é sobrescrito. A versão
que chegou primeiro na nuvem fica na história, e a outra vira uma cópia "(cópia em
conflito)" no Acervo. Com o editor aberto: se o outro aparelho mudar a história e aqui não
houver nada por gravar, o editor mostra a versão nova; se houver, o texto daqui vira a
cópia e o editor avisa.

## Onde fica guardado (Supabase)

Banco PostgreSQL do projeto Supabase, com duas tabelas (`supabase/migrations/`):

- `historias`: uma linha por história e por conta: `story` (a história como o app grava
  no IndexedDB, mesmos campos e mesmo id), `v` (versões anteriores), `rev` (revisão),
  `dev` (aparelho), `at`, `gone` (excluída de vez, para sumir dos outros aparelhos);
- `ajustes`: uma linha por conta (nome, frase da capa, letra, marcadores, posição).

**Segurança:** Row Level Security nas duas tabelas: cada conta só lê e grava as próprias
linhas; sem login, nada. A gravação de história passa pela função `put_historia`, que
confere a revisão no próprio banco: uma resposta atrasada ou outro aparelho nunca grava por
cima de uma versão mais nova. No app vão só o endereço do projeto e a chave pública
(`anon`), que sozinha não lê nada. A chave secreta (`service_role`) não é usada em lugar
nenhum do app.

**Sincronização:** ao entrar, o app lê tudo da nuvem; depois recebe as mudanças em tempo
real (Supabase Realtime) e, de reserva, relê ao voltar para a página, ao reconectar e a
cada minuto. O IndexedDB continua como cópia local (para abrir e escrever sem internet):
grava primeiro aqui e envia em seguida; a nuvem é a referência, e o que chega dela é
gravado aqui.

## Configuração (uma vez)

### Situação atual (22/10/2026)

- Projeto Supabase **arquivo-das-sombras** (`whnahjpxpupbqiinjbjt`, região São Paulo,
  plano gratuito), criado pelo conector do Supabase. A migração de
  `supabase/migrations/` já foi aplicada: tabelas, RLS, `put_historia` e tempo real. O
  RLS foi testado no próprio banco (outra conta e sem login não leem nem gravam; revisão
  conferida) e os avisos de segurança do Supabase estão vazios.
- O endereço do projeto e a chave pública (`anon`) estão em `.env.production`, que vai
  para o Git: o Vite os coloca no build de produção (Vercel e GitHub Pages) sem precisar de
  variáveis no painel. São valores públicos (vão no JavaScript do site de qualquer forma);
  quem protege os dados é o RLS. Variáveis `VITE_SUPABASE_*` no painel do Vercel, se
  existirem, têm prioridade sobre o arquivo.
- No link do claude.ai o app continua usando a nuvem do próprio link.
- **Acervo aberto, sem login** (escolha do dono, 22/10/2026: o site é usado só por ele).
  `.env.production` tem `VITE_ACERVO_ABERTO` (o id da conta do acervo): o site abre e salva
  direto, sem e-mail nem senha, em tempo real entre os aparelhos. No banco,
  `supabase/migrations/20261022210000_acervo_aberto.sql` deixa o visitante sem login
  (papel `anon`) ler e gravar **só** as linhas dessa conta (função `acervo_aberto()`);
  outras contas continuam isoladas e ninguém sem login apaga linhas. Consequência: quem
  tiver o endereço do site pode ler e mudar o acervo. Para fechar: troque o corpo de
  `acervo_aberto()` por `select null::uuid` e tire `VITE_ACERVO_ABERTO` do build (o app
  volta ao login; com `VITE_ACERVO_EMAIL`, o login é por senha, uma vez por aparelho).

Falta só, no painel do Supabase (não há ferramenta para isso fora do painel):

1. **Authentication → URL Configuration:**
   - Site URL: `https://arquivo-das-sombras.vercel.app`
   - Redirect URLs: `https://arquivo-das-sombras.vercel.app/**` e
     `https://projetocaic47-hash.github.io/arquivo-das-sombras/**`
2. **Authentication → Emails → Magic Link** (para entrar com código no celular): incluir
   `{{ .Token }}` no texto do e-mail.
3. Depois de criar a sua conta: **Authentication → Sign In / Providers** → desligar
   "Allow new users to sign up".

### Para recriar em outro projeto Supabase

1. Crie um projeto em supabase.com (plano gratuito serve).
2. **SQL Editor** → cole e rode `supabase/migrations/20261022000000_arquivo_nuvem.sql`
   (pode rodar de novo sem problema).
3. Faça os três passos acima.
4. **Project Settings → API:** troque a *Project URL* e a chave *anon public* em
   `.env.production` (ou cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Vercel,
   em Production e Preview, e faça **Redeploy**). Modelo em `.env.example`.

## Migração dos textos antigos

Automática e segura, em cada aparelho que já tem histórias:

1. Antes, por garantia: **Acervo → Backup do acervo** (arquivo .json).
2. Abra o site publicado e entre com o e-mail.
3. Todas as histórias deste navegador sobem com o mesmo id, título, texto, etiquetas,
   ordem, datas e versões. O aviso só passa a "salvo na nuvem" depois que a nuvem
   confirmou cada uma.
4. Repita nos outros aparelhos com histórias antigas. A mesma história igual nos dois não
   duplica; diferente, as duas ficam (uma como cópia). Recarregar ou interromper e
   recomeçar não cria duplicatas (o id é a chave, e a revisão é conferida).
5. A cópia local (IndexedDB) nunca é apagada pela migração.

Se falhar, o aviso diz "erro ao salvar na nuvem" e as histórias continuam no aparelho,
pendentes, até a próxima tentativa.

Atenção: num navegador compartilhado, entrar com outra conta envia para ela as histórias
que estão nesse navegador.

## Código

- `src/data/sync.ts`: motor de sincronização (fila, pendências, revisões, conflitos,
  exclusões, ajustes, novas tentativas, estado com erro). Testado em `tests/sync.test.ts`.
- `src/data/supabaseCloud.ts`: Supabase (login, leitura, gravação com revisão, tempo
  real). Carregado só quando configurado.
- `src/data/cloud.ts`: banco do link do claude.ai.
- `src/state/useArchive.ts`: escolhe a nuvem, acompanha a conta e liga o motor ao acervo.
- `src/ui/Settings.tsx` (Nuvem: entrar, código, sair), `src/ui/Editor.tsx` (estado na
  linha do editor e mudança vinda de outro aparelho), `src/ui/cloudLabel.ts`, aviso do
  canto em `src/App.tsx`.
- `supabase/migrations/`: tabelas, RLS, função `put_historia`, tempo real.

## Testes

- `bash scripts/test-nuvem-sql.sh`: a migração num PostgreSQL real; RLS (outra conta e
  sem login não leem nem gravam), revisão conferida, acentos preservados.
- `node e2e/nuvem-real.mjs`: o app compilado com o cliente oficial do Supabase, falando
  com um "mini-Supabase" local (`e2e/mini-supabase.mjs`: PostgreSQL de verdade, mesma
  migração, RLS ativo). Dois navegadores independentes: migração, persistência, celular,
  falha de conexão, edição simultânea, outra conta, sem login.
- `node e2e/nuvem-supabase.mjs`: o mesmo fluxo com um servidor imitado em memória, mais
  rápido, incluindo tempo real, editor aberto durante mudança de outro aparelho e sair da
  conta.
- `node e2e/nuvem.mjs`: a nuvem do link do claude.ai, com banco imitado.

O que estes testes **não** cobrem: o serviço Supabase de verdade (endereço, e-mail de
login, Realtime), que precisa ser conferido no site publicado, num computador e num
celular de verdade, depois da configuração acima.

## Limites

- História muito grande (mais de cerca de 200 mil caracteres, contando as versões) sobe
  sem as versões mais antigas; se nem assim couber, fica só no aparelho e o aviso diz isso.
- "Restaurar backup → substituir tudo" vale como excluir de vez as histórias que não estão
  no backup, também na nuvem.
