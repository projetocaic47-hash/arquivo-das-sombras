import { describe, expect, it } from 'vitest'
import { curlLeaf, easeTurn, restProfile, type CurlParams } from '../src/scene/book/curl'

const prm: CurlParams = { width: 0.167, height: 0.245, cols: 48, rows: 8, rightHeight: 0.03, leftHeight: 0.008, gutter: 0.04 }
const n = (prm.cols + 1) * (prm.rows + 1) * 3
const shape = (p: number) => curlLeaf(new Float32Array(n), p, prm)
const at = (a: Float32Array, i: number, j: number) => {
  const k = (j * (prm.cols + 1) + i) * 3
  return [a[k], a[k + 1], a[k + 2]]
}

describe('curvatura da folha', () => {
  const steps = Array.from({ length: 101 }, (_, i) => i / 100)

  it('o papel não estica: cada fileira mantém a largura da página em qualquer momento', () => {
    for (const p of steps) {
      const a = shape(p)
      for (let j = 0; j <= prm.rows; j++) {
        let len = 0
        for (let i = 1; i <= prm.cols; i++) {
          const [x0, y0] = at(a, i - 1, j)
          const [x1, y1] = at(a, i, j)
          len += Math.hypot(x1 - x0, y1 - y0)
        }
        expect(len).toBeCloseTo(prm.width, 6)
      }
    }
  })

  it('começa deitada sobre a pilha da direita e termina sobre a da esquerda', () => {
    const right = restProfile(prm.rightHeight, prm.width, prm.gutter, prm.cols)
    const left = restProfile(prm.leftHeight, prm.width, prm.gutter, prm.cols)
    const a0 = shape(0)
    const a1 = shape(1)
    for (let i = 0; i <= prm.cols; i++) {
      expect(at(a0, i, 4)[0]).toBeCloseTo(right[i][0], 6)
      expect(at(a0, i, 4)[1]).toBeCloseTo(right[i][1], 6)
      expect(at(a1, i, 4)[0]).toBeCloseTo(-left[i][0], 6)
      expect(at(a1, i, 4)[1]).toBeCloseTo(left[i][1], 6)
    }
  })

  it('nunca atravessa as pilhas: fica acima do perfil da direita e da esquerda', () => {
    const right = restProfile(prm.rightHeight, prm.width, prm.gutter, prm.cols)
    const left = restProfile(prm.leftHeight, prm.width, prm.gutter, prm.cols)
    const surf = (pts: [number, number][], x: number) => {
      for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0])
      return pts[pts.length - 1][1]
    }
    for (const p of steps) {
      const a = shape(p)
      for (let j = 0; j <= prm.rows; j++)
        for (let i = 0; i <= prm.cols; i++) {
          const [x, y] = at(a, i, j)
          // a raiz, presa na lombada, passa de uma pilha à outra: só o papel fora dela conta
          if (Math.abs(x) < 0.001) continue
          const under = x >= 0 ? surf(right, x) : surf(left, -x)
          // as pilhas são desenhadas com a mesma grade; tolerância de 0,05 mm (a folha fica 0,4 mm acima)
          expect(y, `p=${p} i=${i} j=${j} x=${x}`).toBeGreaterThanOrEqual(under - 5e-5)
        }
    }
  })

  it('movimento contínuo: entre quadros próximos nenhum ponto salta', () => {
    let prev = shape(0)
    for (let s = 1; s <= 400; s++) {
      const cur = shape(s / 400)
      let max = 0
      for (let k = 0; k < cur.length; k++) max = Math.max(max, Math.abs(cur[k] - prev[k]))
      // 1/400 da virada nunca move um ponto mais que 4 mm
      expect(max).toBeLessThan(0.004)
      prev = cur
    }
  })

  it('a virada acelera e desacelera', () => {
    expect(easeTurn(0)).toBe(0)
    expect(easeTurn(1)).toBe(1)
    expect(easeTurn(0.05)).toBeLessThan(0.05)
    expect(easeTurn(0.95)).toBeGreaterThan(0.95)
  })
})
