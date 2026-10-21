# Efeitos sonoros

Todos os sons vêm do mesmo mundo: papel antigo, couro, madeira, cera, uma chama pequena e
ferro enferrujado. São sintetizados na hora com Web Audio (`src/audio/synth.ts`): sem
arquivos, sem bibliotecas e sem música de fundo. Cada toque sorteia pequenas variações, para
não soar mecânico.

## Como funciona (`src/audio/sfx.ts`)

- **Um único áudio para o app inteiro**, criado no primeiro clique, toque ou tecla (os
  navegadores bloqueiam som antes disso; no iPhone sai um silêncio de destrava dentro do gesto).
- Caminho de todo som: voz → um pouco de sala (reverberação curta e escura) → volume geral →
  limitador → alto-falante. O limitador impede distorção quando vários sons coincidem.
- **Sem duplicar:** o mesmo som pedido duas vezes em menos de 40 ms toca uma vez; cada som tem
  no máximo duas vozes ao mesmo tempo (a mais antiga some num fade curto).
- **Sem corte seco:** os sons terminam em decaimento; parar (sair da porta, desligar o som) é
  sempre um fade.
- **Reduzir animações** (Ajustes ou sistema): o fechar do livro e as dobradiças da porta ficam
  mais curtos, acompanhando as animações.
- **Ajustes → Efeitos sonoros** liga/desliga; **Volume dos efeitos** de 0 a 100%. Ficam no
  `localStorage` (chave `arquivo-som`), fora do IndexedDB: o banco das histórias não muda.
- Sem Web Audio, ou com erro no áudio, o app segue igual, em silêncio.

## Onde cada som toca

| Momento | Som |
| --- | --- |
| Abrir o livro / fechar | `book.open` (capa de couro e lombada) / `book.close` e `book.thud` quando a capa assenta |
| Virar a página (botão, seta, toque) | `page.turn` |
| Pular para história, índice, marcador, continuar leitura | `page.flick` (uma folha por vez, rápido) |
| Arrastar a folha / soltar | `page.lift` / `page.land` |
| Marcar / desmarcar página | `ribbon.mark` (fita de seda subindo / descendo) |
| Acervo abrir / fechar | `box.open` / `box.close` (caixa de madeira) |
| Ajustes | `candle.breath` (a chama respira) |
| Escrever (editor) | `quill.dip` (pena no tinteiro) |
| Folhas soltas, leitura, versões, exportar, duplicar, recuperar | `paper.pick` |
| Enviar ao livro / deixar na mesa | `paper.place` |
| Fechar outras janelas | `panel.close` |
| Pergunta / Manter ou Cancelar | `dialog.open` / `dialog.cancel` |
| Lixeira / excluir de vez | `paper.crumple` / `paper.tear` |
| Backup do acervo | `seal.stamp` (lacre de cera) |
| Ordem, favorito, modo foco, opções | `ui.tick` |
| Erro ("Não foi possível…", "Erro:") | `ui.error` (duas batidas surdas) |
| Porta: bater, vela, cartaz, abertura | `door.knock`, `door.ignite`, `door.poster`, `door.hinges` |

Não há som ao digitar, no salvamento automático nem ao passar o mouse.

## Trocar por arquivos gravados (opcional)

Os sons da porta aceitam arquivos em `public/sons/`, listados em `public/sons/lista.json`
(por exemplo `["porta-batida-1.mp3", "vela-acender.mp3"]`): `porta-batida-1/2/3`,
`vela-acender`, `madeira-rangendo`, `porta-dobradicas`. Arquivo ausente: vale o sintetizado.

## Testes

- `node e2e/sons.mjs`: gravação offline de todos os sons (pico, fim sem corte, todos juntos sem
  saturar; os `.wav` ficam em `e2e/out/sons/`), destrava no gesto, um som por interação,
  nada preso, desligar, volume, preferência depois de recarregar, IndexedDB intacto, áudio
  quebrado sem erro.
- `node e2e/porta-celular.mjs`: porta em celulares e tablets emulados no Chromium, só com toque.
