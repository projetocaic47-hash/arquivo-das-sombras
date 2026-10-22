# Efeitos sonoros

Todos os sons vêm do mesmo mundo: papel antigo, couro, madeira, cera, uma chama pequena e
ferro enferrujado. Os efeitos são sintetizados na hora com Web Audio (`src/audio/synth.ts`),
sem bibliotecas; cada toque sorteia pequenas variações, para não soar mecânico. Três
gravações enviadas pela usuária completam o ambiente (abaixo): chuva, trovões e a porta.

## Gravações (`public/sons/`)

| Arquivo | Original | Uso |
| --- | --- | --- |
| `chuva.mp3` | heavy-rain-outside-the-window (42 s, 48 kHz estéreo, 1,3 MB) | chuva de fundo, em loop |
| `trovoes.mp3` | dry-thunder (2 min 37 s, 44,1 kHz estéreo, 4,8 MB) | trovões sobre a chuva, em loop |
| `porta-abrindo.mp3` | old-door-sound-night-time (4,6 s, 48 kHz mono, 144 KB) | rangido da porta abrindo |

## Chuva e trovões (`src/audio/ambient.ts`)

- Uma camada só, sob o volume geral: chuva 0,25 e trovões 0,14 com "Volume da chuva" em
  100% (padrão 80%). No volume padrão do app a mistura fica perto de −44 LUFS, com pico de
  −18 dBFS: discreta, por baixo dos efeitos. Os arquivos não são amplificados.
- Começa só no primeiro gesto (a primeira batida na porta), com fade de 3 s, e só então
  baixa os arquivos: a abertura do app não espera pelo áudio.
- Chuva: decodificada uma vez; os poucos ms de silêncio de codificação nas pontas do MP3 são
  cortados e o fim é fundido no começo (crossfade de igual potência, 1,5 s), então o loop não
  tem buraco nem estalo.
- Trovões: tocados em streaming por um elemento de áudio (decodificar 2 min 37 s ocuparia
  ~55 MB de memória). O arquivo começa e termina quase em silêncio, então a volta do loop não
  se percebe; as pausas entre trovões são as da gravação.
- Navegar, abrir janelas e mudar o volume não reiniciam nada. Desligar o som ou a chuva faz
  um fade, para os arquivos e libera a memória. Aba escondida ou janela minimizada: fade,
  pausa e o áudio dorme; ao voltar, retoma de onde estava.

## Relâmpagos sincronizados (`src/audio/thunderMarks.ts`, `src/scene/atmosphere.ts`)

Com os trovões tocando, o relâmpago da janela pisca pouco antes de cada um dos 12 trovões
fortes da gravação (a luz chega antes do som): de 0,3 s antes, nos mais fortes e próximos, a
1,7 s, nos distantes, que também clareiam menos. O ronco contínuo entre eles não gera clarão.
As marcas vêm de `scripts/trovoes-marcas.py`; refazer se o arquivo de trovões mudar. Sem som
(antes do primeiro gesto, som ou chuva desligados), os relâmpagos voltam a cair em
intervalos aleatórios, como antes. Com "reduzir animações", só os trovões mais fortes piscam.

## Porta (`src/entrance/sound.ts`)

A gravação é só a abertura (rangido contínuo que vai desacelerando em estalos espaçados, sem
batida de fechar), e a porta do app só abre; por isso não há som de fechar. Ao tocar o
cartaz, o tranco sintetizado de desprender toca com o primeiro movimento e o rangido gravado
entra 1,0 s depois, agendado no relógio do áudio: é quando a folha começa a girar de verdade
(`doorAngle`), e os estalos finais caem na desaceleração. Com "reduzir movimento" a abertura
é curta e usa o rangido sintetizado curto. Toques repetidos não duplicam nada.

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
- **Ajustes:** "Som (efeitos e chuva)" liga/desliga tudo; "Chuva e trovões" só o fundo;
  "Volume geral" e "Volume da chuva". Ficam no `localStorage` (chave `arquivo-som`), fora do
  IndexedDB: o banco das histórias não muda.
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
| Porta: bater, vela, cartaz, abertura | `door.knock`, `door.ignite`, `door.poster`, `door.unlatch` + `door.creak` (gravação) |

Não há som ao digitar, no salvamento automático nem ao passar o mouse.

## Trocar por arquivos gravados (opcional)

Os sons da porta aceitam arquivos em `public/sons/`, listados em `public/sons/lista.json`
(hoje `["porta-abrindo.mp3"]`): `porta-batida-1/2/3`, `vela-acender`, `madeira-rangendo`,
`porta-abrindo`. Arquivo ausente: vale o sintetizado.

## Testes

- `node e2e/sons.mjs`: gravação offline de todos os sons (pico, fim sem corte, todos juntos sem
  saturar; os `.wav` ficam em `e2e/out/sons/`), destrava no gesto, um som por interação,
  nada preso, desligar, volume, preferência depois de recarregar, IndexedDB intacto, áudio
  quebrado sem erro.
- `node e2e/porta-celular.mjs`: porta em celulares e tablets emulados no Chromium, só com toque.
- `node e2e/ambiente.mjs`: emenda do loop, nível da mixagem, carga só depois do gesto, uma
  chuva só, navegação e volume sem reiniciar, silenciar e reativar, aba escondida (simulada),
  rangido da porta sincronizado e sem duplicar, no computador e no celular emulado.
