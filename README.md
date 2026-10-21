# Arquivo das Sombras — nova aplicação

Reconstrução do `Arquivo das Sombras (1).html` em React + TypeScript + three.js.
O HTML original continua intocado na pasta do projeto e é a referência.

**Estado atual: Fase 7 (validação final).** Guia para quem usa: [COMO-USAR.md](COMO-USAR.md). O quarto 3D tem o livro que abre
(clique nele ou em "Abrir o livro"), e as páginas viram com curvatura e sombra, por
clique, setas ou arrastando a folha. Tudo o que o original fazia voltou:

- **Escrever** abre uma folha de papel que grava sozinha (0,7 s depois de cada
  mudança, ao fechar e com Ctrl+S), guarda versões anteriores a cada 10 minutos de
  edição (até 15), tem modo foco e os botões "deixar na mesa", "enviar ao livro" e
  "guardar e ver no livro".
- **Acervo**: busca, filtros por situação e etiqueta, ordem, ↑ ↓, favoritos,
  duplicar, lixeira (recuperar, excluir de vez), exportar .txt, .md e tudo em .md,
  backup, restaurar e colar backup.
- **Ajustes**: nome, frase da capa, tamanho da letra e reduzir animações. Sem som por enquanto: o diretor vai enviar os arquivos de áudio.
- **Texto diagramado como livro impresso** (`src/book/typeset.ts`): letra capital
  gótica de três linhas no começo de cada história, com o resto da primeira palavra em
  maiúsculas; parágrafos com recuo (sem linhas em branco); linhas justificadas;
  travessão nos diálogos; aspas curvas; reticências; espaços corrigidos; parágrafo
  sempre começando com maiúscula; `***` sozinho na linha vira pausa de cena com
  ornamento. Só muda como aparece no livro: o texto guardado fica como foi escrito.
- No livro: índice clicável, marcadores (fita na página), "Editar esta",
  "Continuar leitura" e os marcadores na barra com o livro fechado.
- **Folhas soltas**: os rascunhos mais recentes ficam como folhas sobre a mesa 3D
  (clique para editar), e também em lista pelo botão do alto.
- Arquivos (backup, .txt, .md): dentro do Claude, pela permissão de downloads da
  página; num site comum, pelo download do navegador; se nenhum funcionar, o texto
  aparece para copiar.

**Acabamento (Fase 6):**

- A mesa responde ao mouse: livro (abre), folhas soltas (editam), tinteiro com pena
  (escreve), caixa de fichas (acervo) e vela (ajustes). O contorno dourado aparece só
  com o mouse em cima. Os botões do alto são fitas de tecido, para quem prefere botões
  ou usa o teclado.
- Fumaça sobe da vela (`src/scene/objects/Smoke.tsx`) e poeira flutua na luz dela, como no original (`Dust.tsx`).
- Sem 3D (navegador antigo ou aceleração desligada), o app avisa e continua
  funcionando: acervo, escrita, ajustes e uma leitura simples com a mesma diagramação.
  Se o navegador soltar a placa de vídeo no meio do uso, aparece um aviso para recarregar.
- Teclado: o foco entra nas janelas ao abrir, Tab circula dentro delas, Esc fecha (no
  editor, grava e fecha; nas perguntas, escolhe a opção que não muda nada).
- "Reduzir animações" acalma também a vela, os relâmpagos, a câmera e a fumaça.
- Letra das páginas: Jersey 10, fonte de pixel feita para tamanhos pequenos, desenhada
  na textura em múltiplo inteiro do pixel dela e com tinta sem meios-tons, para ficar
  nítida nas duas páginas, no computador e no celular.
- **Leitura em tela cheia** (`src/reader/`): ao abrir, o livro ocupa a tela, visto de cima, em papel antigo desenhado no shader (manchas, ferrugem, fibras, bordas gastas) e letra grande e nítida. A folha que vira se curva e ondula (`curl.ts` com ondas); em tela em pé, cada página vira sozinha. O quarto para de desenhar enquanto ela cobre a tela.
- Botões "« história" e "história »" no livro: pulam para o começo da história anterior
  ou da próxima, sem virar página por página.
- O livro aberto é enquadrado entre as barras de botões; no celular deitado, as
  barras ficam nas laterais.

**Nuvem** ([docs/NUVEM.md](docs/NUVEM.md)): aberto pelo link do claude.ai com a conta da
pessoa, tudo o que é escrito ou ajustado sobe sozinho para o banco do link, numa área
privada da conta, e aparece nos outros aparelhos. Sem conexão, as mudanças ficam
pendentes e sobem depois; conflitos viram cópias, nunca sobrescrevem. O aviso no canto de
baixo diz "salvo na nuvem", "salvando…", "alterações pendentes" ou "só neste aparelho".

**Porta de entrada** (`src/entrance/`): o app começa diante de uma porta em pixel art. Bater três vezes no centro, acender a vela da direita e tocar o cartaz da esquerda abre a porta. Os sons da porta são sintetizados; arquivos gravados em `public/sons/` (listados em `public/sons/lista.json`) substituem os sintetizados.

**Efeitos sonoros** (`src/audio/`): papel, couro, madeira, cera e ferro, sintetizados na hora com Web Audio, sem arquivos nem bibliotecas e sem música de fundo. Em Ajustes: ligar/desligar e volume (guardados no navegador). Detalhes e lista dos sons em [docs/SONS.md](docs/SONS.md).

O banco continua o mesmo do original (versão 1, mesmos campos): o original lê o que a
nova app escreve, e o contrário (`node e2e/compat.mjs`).

**Estilo gráfico: pixel 3D** (escolha do diretor criativo em 20/10/2026). A mesma
cena 3D é desenhada em baixa resolução, ampliada sem suavizar, com paleta limitada
e pontilhado (`src/scene/style.ts`, `src/scene/shaders/palette.ts`). O visual
realista continua acessível com `?estilo=realista`.

## Como rodar (para quem desenvolve)

Requer Node.js 20 ou mais novo.

```
npm install        # instala as dependências (uma vez)
npm run dev        # abre em http://localhost:5173
npm run build      # verifica tipos e gera a versão final em dist/
npm test           # testes automáticos do banco e do backup
node scripts/gen-textures.mjs   # regera as texturas de public/textures (só se mudar o gerador)
node e2e/compat.mjs "../Arquivo das Sombras (1).html"   # teste com o original, após npm run build
node e2e/shots.mjs # capturas do quarto em e2e/out, com npx vite preview --port 4173 rodando
node e2e/book.mjs  # capturas do livro abrindo e virando páginas, em e2e/out/livro
node e2e/capital.mjs # primeira página de uma história (letra capital), em e2e/out/capital
bash e2e/validar.sh "../Arquivo das Sombras (1).html"   # validação completa: compila e roda todos os testes abaixo
node e2e/mesa.mjs   # contorno e clique dos objetos da mesa, fumaça, em e2e/out/mesa
node e2e/audit6.mjs 4173 e2e/out/fase6 [sizes|keys|nogl]   # tamanhos de tela, teclado e recarregar, sem 3D
node e2e/leitura.mjs # leitura em tela cheia: abrir, arrastar, tocar, fechar, em e2e/out/leitura
node e2e/fase5.mjs # editor, acervo, marcador e índice, em e2e/out/fase5
```

A pasta `dist/` precisa ser servida por um servidor web (por exemplo
`npm run preview`); abrir `dist/index.html` com duplo clique não funciona.

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `src/data/` | tipos dos registros, acesso ao IndexedDB, backup, restauração e regras das histórias (`stories.ts`) |
| `src/book/` | livro sem 3D: paginação (`pages.ts`) e estado das animações (`controller.ts`) |
| `src/state/` | estado do acervo em memória ligado ao banco e à nuvem |
| `src/audio/` | efeitos sonoros: receitas (`synth.ts`) e motor central (`sfx.ts`) |
| `src/entrance/` | porta de entrada: sequência (`puzzle.ts`), sons (`sound.ts`) e desenho (`Entrance.tsx`) |
| `src/ui/` | interface: editor, acervo, ajustes, perguntas e entrega de arquivos |
| `src/scene/book/` | livro 3D: modelo, curvatura da folha (`curl.ts`) e desenho das páginas (`pageArt.ts`) |
| `src/scene/` | cena 3D: `objects/` (quarto, mesa, janela, vela, livro), `shaders/` (vista da janela, chama), `layout.ts` (medidas em metros), `atmosphere.ts` (tremor da vela e relâmpagos) |
| `scripts/` | gerador das texturas PBR (madeira, gesso, couro, papel), feitas por código e sem licença de terceiros |
| `public/textures/` | texturas geradas |
| `tests/` | testes automáticos (Vitest + fake-indexeddb) |
| `e2e/` | teste de compatibilidade com o HTML original em Chromium |
| `docs/SONS.md` | sons: onde cada um toca e como trocar por arquivos |
| `docs/DADOS.md` | formato do banco e regras de compatibilidade |

## Dependências

| Pacote | Função |
| --- | --- |
| react, react-dom | interface |
| three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, postprocessing | cena 3D |
| idb | acesso ao IndexedDB com promessas |
| @fontsource/cinzel, @fontsource/crimson-pro | fontes do projeto embutidas (licença OFL) |
| @fontsource/pixelify-sans, @fontsource/jacquarda-bastarda-9 | letras em pixel das páginas e títulos góticos (licença OFL) |
| vite, @vitejs/plugin-react, typescript, vitest, fake-indexeddb, @types/* | só desenvolvimento |

As versões estão fixadas em `package.json` e `package-lock.json`.
