// Trovões fortes de public/sons/trovoes.mp3: [início em segundos, pico em dBFS].
// Gerado por scripts/trovoes-marcas.py (refazer se o arquivo de trovões mudar). O relâmpago da
// janela pisca um pouco antes de cada um: a luz chega antes do som, e quanto mais forte (mais
// perto) o trovão, menor a espera.
export const THUNDER_MARKS: readonly (readonly [number, number])[] = [
  [1.55, -13.4],
  [17.23, -18.1],
  [35.88, -6.1],
  [47.17, -16.3],
  [55.12, -7.9],
  [63.98, -16.4],
  [82.0, -7.8],
  [106.53, -14.2],
  [113.72, -8.4],
  [122.4, -5.5],
  [130.72, -17.3],
  [138.22, -19.5],
]

/** força de 0 (distante) a 1 (perto) */
export const thunderStrength = (peakDb: number) => Math.min(1, Math.max(0, (peakDb + 20) / 15))
/** segundos entre o clarão e o começo do trovão */
export const thunderLag = (peakDb: number) => 0.3 + (1 - thunderStrength(peakDb)) * 1.4
