# Arquivo das Sombras — nova aplicação

Reconstrução do `Arquivo das Sombras (1).html` em React + TypeScript + three.js.
O HTML original continua intocado na pasta do projeto e é a referência.

**Estado atual: Fase 2 (estrutura).** A aplicação abre, lê o mesmo banco do
original e importa ou exporta backups. O quarto 3D começa na Fase 3; por
enquanto a cena é só um teste de que o 3D funciona no navegador.

## Como rodar (para quem desenvolve)

Requer Node.js 20 ou mais novo.

```
npm install        # instala as dependências (uma vez)
npm run dev        # abre em http://localhost:5173
npm run build      # verifica tipos e gera a versão final em dist/
npm test           # testes automáticos do banco e do backup
node e2e/compat.mjs "../Arquivo das Sombras (1).html"   # teste com o original, após npm run build
```

A pasta `dist/` precisa ser servida por um servidor web (por exemplo
`npm run preview`); abrir `dist/index.html` com duplo clique não funciona.

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `src/data/` | tipos dos registros, acesso ao IndexedDB, backup e restauração |
| `src/state/` | estado do acervo em memória ligado ao banco |
| `src/ui/` | interface (por enquanto, um painel provisório de dados) |
| `src/scene/` | cena 3D (vazia até a Fase 3) |
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
| vite, @vitejs/plugin-react, typescript, vitest, fake-indexeddb, @types/* | só desenvolvimento |

As versões estão fixadas em `package.json` e `package-lock.json`.
