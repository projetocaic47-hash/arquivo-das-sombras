# Desempenho: medições de 21/10/2026

Mesmas condições antes e depois: o mesmo servidor estático local, Chromium 1194 headless e
Lighthouse 12.8.2. Neste ambiente não há placa de vídeo, então o WebGL roda por software
(SwiftShader). Por isso o custo do quarto 3D aparece muito maior do que num aparelho real. Os
números servem para comparar antes e depois, não como valores absolutos.

- **Antes:** commit 35b4509.
- **Depois:** esta entrega.
- **Scripts:** `measure.mjs` (métricas do Chrome via CDP, commits do React, quadros por
  segundo, tarefas longas, ouvintes de eventos) e Lighthouse no modo padrão, com celular
  simulado e desktop.

## Problemas encontrados

1. **O quarto 3D era desenhado por trás da porta fechada.** A imagem da porta é opaca e cobre
   a tela, mas o quarto continuava a 60 quadros por segundo, disputando CPU e GPU com a
   animação da porta.
   - Agora ele carrega e desenha os primeiros quadros (texturas e shaders prontos), para e só
     volta quando a porta começa a abrir.
2. **A porta "pulava" ao abrir o app (CLS 0,376 no celular).** O primeiro desenho usava
   escala 1 e só depois corrigia o tamanho.
   - Agora já nasce no tamanho certo.
3. **three.js (397 KB) era baixado antes da primeira tela.** Um material do contorno, criado
   no módulo que o App importa, puxava a biblioteca inteira para o pacote inicial.
   - O material foi para `scene/outline.ts` e three.js passou a carregar junto com a cena.
4. **Áudio.** Decodificar os trovões ocuparia cerca de 55 MB.
   - Eles tocam em streaming.
   - Chuva e trovões só são baixados depois do primeiro gesto.
   - Com a aba escondida, o áudio é suspenso.

## Porta (primeira tela), 10 s parada nela

| | antes | depois |
| --- | --- | --- |
| quadros por segundo | 3,8 | 60 |
| CPU ocupada | 105% | 32% |
| tarefas longas (>50 ms) | 38 | 0 |
| quadros/s com CPU 4× mais lenta | 2,7 | 38,7 |
| tarefas longas com CPU 4× mais lenta | 29 | 3 |

## Lighthouse, página inicial (porta)

| | antes celular | depois celular | antes desktop | depois desktop |
| --- | --- | --- | --- | --- |
| FCP | 7,2 s | 6,1 s | 1,3 s | 1,2 s |
| LCP | 9,7 s | 9,5 s | 1,7 s | 1,8 s |
| TBT | 154 s | 18,8 s | 38,1 s | 4,2 s |
| CLS | 0,376 | 0 | 0,027 | 0 |
| Time to Interactive | 180 s | 33 s | 46 s | 7,4 s |

O TBT e o Time to Interactive vêm quase todos do WebGL por software.

## Outros

- **JS antes da primeira tela:** 677 KB (197 KB comprimidos) antes, 304 KB (97 KB
  comprimidos) depois.
- **Quarto aberto e parado:** sem mudança, 104% de CPU e 3,7 quadros/s no WebGL por
  software. O quarto é animado (vela, chuva na janela, poeira) e não foi simplificado.
- **Abrir e fechar o Acervo 10 vezes:** os ouvintes de eventos continuam iguais (28 antes e
  28 depois, sem vazamento).
  - Há 1 ouvinte a mais que antes: o de visibilidade da ambientação.
- **Commits do React com o app parado:** 0 por segundo, antes e depois.
- **Áudio:**
  - Chuva decodificada: cerca de 15 MB, uma vez.
  - Trovões em streaming: sem buffer grande.
  - Ao desligar a chuva, a memória é liberada.
