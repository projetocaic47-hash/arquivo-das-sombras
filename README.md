# Arquivo das Sombras — nova aplicação

Reconstrução do `Arquivo das Sombras (1).html` em React + TypeScript + three.js.
O HTML original continua intocado na pasta do projeto e é a referência.

**Estado atual: Fase 4 (livro e páginas).** O quarto 3D tem o livro que abre
(clique nele ou em "Abrir o livro"), a câmera se aproxima e as páginas viram com
curvatura e sombra, por clique, setas do teclado ou arrastando a folha. As páginas
mostram as histórias do acervo, na ordem e numeração do original (índice e
histórias). Em telas estreitas aparece uma página por vez. O painel de dados da
Fase 2 abre pelo botão "Acervo"; editar e escrever voltam na Fase 5.

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
```

A pasta `dist/` precisa ser servida por um servidor web (por exemplo
`npm run preview`); abrir `dist/index.html` com duplo clique não funciona.

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `src/data/` | tipos dos registros, acesso ao IndexedDB, backup e restauração |
| `src/book/` | livro sem 3D: paginação (`pages.ts`) e estado das animações (`controller.ts`) |
| `src/state/` | estado do acervo em memória ligado ao banco |
| `src/ui/` | interface (por enquanto, um painel provisório de dados) |
| `src/scene/book/` | livro 3D: modelo, curvatura da folha (`curl.ts`) e desenho das páginas (`pageArt.ts`) |
| `src/scene/` | cena 3D: `objects/` (quarto, mesa, janela, vela, livro), `shaders/` (vista da janela, chama), `layout.ts` (medidas em metros), `atmosphere.ts` (tremor da vela e relâmpagos) |
| `scripts/` | gerador das texturas PBR (madeira, gesso, couro, papel), feitas por código e sem licença de terceiros |
| `public/textures/` | texturas geradas |
| `tests/` | testes automáticos (Vitest + fake-indexeddb) |
| `e2e/` | teste de compatibilidade com o HTML original em Chromium |
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
