import { describe, expect, it } from 'vitest'
import { candleLit, opened, press, START, type PuzzleState, type Spot } from '../src/entrance/puzzle'

const run = (spots: Spot[]) => {
  let s: PuzzleState = START
  const effects: (string | null)[] = []
  for (const sp of spots) {
    const r = press(s, sp)
    s = r.state
    effects.push(r.effect)
  }
  return { s, effects }
}

describe('puzzle da porta', () => {
  it('três batidas, vela, cartaz: abre', () => {
    const { s, effects } = run(['door', 'door', 'door', 'candle', 'poster'])
    expect(s).toEqual({ k: 'opening' })
    expect(effects).toEqual(['knock', 'knock', 'knock', 'ignite', 'poster'])
    expect(opened(s)).toEqual({ k: 'done' })
  })

  it('vela e cartaz antes da hora não avançam', () => {
    const { s, effects } = run(['candle', 'poster', 'door', 'candle', 'door', 'poster'])
    expect(s).toEqual({ k: 'knock', n: 2 })
    expect(effects).toEqual([null, null, 'knock', null, 'knock', null])
  })

  it('bater de novo depois das três batidas não reinicia nem acende nada', () => {
    const { s } = run(['door', 'door', 'door', 'door', 'door'])
    expect(s).toEqual({ k: 'candle' })
    expect(candleLit(s)).toBe(false)
  })

  it('cartaz antes da vela não abre; vela acesa fica acesa', () => {
    const a = run(['door', 'door', 'door', 'poster'])
    expect(a.s).toEqual({ k: 'candle' })
    const b = run(['door', 'door', 'door', 'candle', 'candle', 'door'])
    expect(b.s).toEqual({ k: 'poster' })
    expect(candleLit(b.s)).toBe(true)
  })

  it('durante a abertura nada mais muda', () => {
    const { s, effects } = run(['door', 'door', 'door', 'candle', 'poster', 'poster', 'door', 'candle'])
    expect(s).toEqual({ k: 'opening' })
    expect(effects.slice(5)).toEqual([null, null, null])
  })
})
