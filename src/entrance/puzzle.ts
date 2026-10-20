// Estado do puzzle da porta de entrada: bater três vezes, acender a vela, examinar o
// cartaz, e a porta abre. Só a interação do estado atual avança; o resto é ignorado.
// Sem navegador nem som, para poder ser testado.

export type Spot = 'door' | 'candle' | 'poster'

export type PuzzleState =
  | { k: 'knock'; n: number }
  | { k: 'candle' }
  | { k: 'poster' }
  | { k: 'opening' }
  | { k: 'done' }

/** O que a tela deve fazer depois de uma interação aceita. */
export type Effect = 'knock' | 'ignite' | 'poster' | null

export const START: PuzzleState = { k: 'knock', n: 0 }
export const KNOCKS = 3

export function press(s: PuzzleState, spot: Spot): { state: PuzzleState; effect: Effect } {
  if (s.k === 'knock' && spot === 'door') {
    const n = s.n + 1
    return { state: n >= KNOCKS ? { k: 'candle' } : { k: 'knock', n }, effect: 'knock' }
  }
  if (s.k === 'candle' && spot === 'candle') return { state: { k: 'poster' }, effect: 'ignite' }
  if (s.k === 'poster' && spot === 'poster') return { state: { k: 'opening' }, effect: 'poster' }
  return { state: s, effect: null }
}

/** A porta terminou de abrir. */
export function opened(s: PuzzleState): PuzzleState {
  return s.k === 'opening' ? { k: 'done' } : s
}

/** A vela já foi acesa (fica acesa até o fim). */
export const candleLit = (s: PuzzleState) => s.k === 'poster' || s.k === 'opening' || s.k === 'done'
