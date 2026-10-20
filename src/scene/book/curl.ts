// Forma da folha que vira. A folha é tratada como papel que não estica: em cada
// fileira (do alto ao pé da página) define-se o ângulo do papel ao longo da largura
// e a posição sai da soma de pequenos trechos de comprimento fixo. Assim a curva
// nunca muda o tamanho da página, e o movimento fica contínuo do começo ao fim.
// Coordenadas da folha: x sai da lombada (x = 0) para fora, y para cima a partir da
// base do miolo, z ao longo da lombada. Sem three.js, para poder ser testado.

export interface CurlParams {
  /** largura e altura da página (m) */
  width: number
  height: number
  cols: number
  rows: number
  /** altura do bloco à direita sob a folha no início e à esquerda no fim (m) */
  rightHeight: number
  leftHeight: number
  /** largura da curva das folhas junto à lombada (m) */
  gutter: number
  /** ondulação do papel no ar (radianos): ondas que correm pela folha enquanto ela vira */
  ripple?: number
  /** fase das ondas, que avança com o tempo para elas correrem */
  phase?: number
}

const PI = Math.PI
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/** Aceleração e desaceleração da virada: começa e termina devagar. */
export function easeTurn(p: number) {
  p = clamp(p, 0, 1)
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

/** Quanto as folhas afundam junto à lombada (m): no máximo 9 mm, nunca mais que a pilha. */
export const gutterDip = (h: number) => Math.min(Math.max(h, 0), 0.009)

/**
 * Ângulo do papel em repouso, a uma distância s da lombada, sobre um bloco de altura h:
 * junto à lombada as folhas afundam um pouco numa curva suave (perfil smoothstep em x).
 */
export function restAngle(s: number, h: number, gutter: number) {
  const dip = gutterDip(h)
  if (dip <= 0) return 0
  const t = clamp(s / gutter, 0, 1)
  return Math.atan((dip * 6 * t * (1 - t)) / gutter)
}

/**
 * Ângulo do papel no ponto u (0 na lombada, 1 na borda) da fileira v (0 no alto, 1 no pé),
 * com a folha em p (0 deitada à direita, 1 deitada à esquerda).
 */
export function leafAngle(p: number, u: number, v: number, prm: CurlParams) {
  const s = u * prm.width
  const w = easeTurn(p)
  const lift = Math.sin(PI * clamp(p, 0, 1))
  // começo: a borda sobe antes da raiz (a mão levanta o canto); fim: a borda chega por último,
  // segurada pelo ar. O canto de cima lidera um pouco mais, o que inclina a dobra.
  const corner = 1 + 0.45 * (0.5 - v)
  // no meio da virada a borda ainda vai à frente: a folha fica arqueada, nunca reta como uma placa
  const lead = 1.4 * lift * Math.pow(1 - p, 1.2) * corner
  const lag = 0.9 * lift * Math.pow(p, 2.2) * (2 - corner)
  const base = PI * w + (1 - w) * restAngle(s, prm.rightHeight, prm.gutter) - w * restAngle(s, prm.leftHeight, prm.gutter)
  // ondas: nascem na lombada presa e crescem para a borda solta; a fase muda com a virada,
  // com o tempo e um pouco do alto ao pé da página, para a onda andar na diagonal
  const amp = (prm.ripple || 0) * lift * Math.sin(PI * 0.5 * u) * (0.6 + 0.4 * lift)
  const wave = amp ? amp * Math.sin(2 * PI * (1.3 * u - 1.6 * p) + 2.2 * v + (prm.phase || 0)) : 0
  const a = base + lead * Math.pow(u, 1.8) - lag * Math.pow(u, 1.3) + wave
  // nunca abaixo do bloco da direita no começo nem além do da esquerda no fim
  const lo = (1 - w) * restAngle(s, prm.rightHeight, prm.gutter)
  const hi = PI - w * restAngle(s, prm.leftHeight, prm.gutter)
  return clamp(a, lo, hi)
}

/**
 * Escreve as posições da grade (cols+1) × (rows+1) em `out` (x, y, z por vértice),
 * fileira por fileira, do alto da página (z = −altura/2) ao pé.
 */
export function curlLeaf(out: Float32Array, p: number, prm: CurlParams, lift = 0) {
  const { cols, rows, width, height } = prm
  const ds = width / cols
  // a raiz da folha, na lombada, passa do fundo da curva da direita ao da esquerda enquanto
  // a folha está em pé, para não entrar em nenhuma das pilhas
  const w = easeTurn(p)
  const mid = clamp((w - 0.4) / 0.2, 0, 1)
  const side = mid * mid * (3 - 2 * mid)
  const root = (1 - side) * (prm.rightHeight - gutterDip(prm.rightHeight)) + side * (prm.leftHeight - gutterDip(prm.leftHeight))
  let k = 0
  for (let j = 0; j <= rows; j++) {
    const v = j / rows
    const z = -height / 2 + v * height
    let x = 0
    let y = lift + root
    let prev = leafAngle(p, 0, v, prm)
    out[k++] = x
    out[k++] = y
    out[k++] = z
    for (let i = 1; i <= cols; i++) {
      const a = leafAngle(p, i / cols, v, prm)
      const mid = (a + prev) / 2
      x += ds * Math.cos(mid)
      y += ds * Math.sin(mid)
      prev = a
      out[k++] = x
      out[k++] = y
      out[k++] = z
    }
  }
  return out
}

/** Perfil de uma pilha de folhas em repouso (lado direito), como pontos [x, y] da lombada à borda. */
export function restProfile(h: number, width: number, gutter: number, cols: number) {
  const pts: [number, number][] = [[0, h - gutterDip(h)]]
  const ds = width / cols
  let x = 0
  let y = h - gutterDip(h)
  let prev = restAngle(0, h, gutter)
  for (let i = 1; i <= cols; i++) {
    const a = restAngle(i * ds, h, gutter)
    const mid = (a + prev) / 2
    x += ds * Math.cos(mid)
    y += ds * Math.sin(mid)
    prev = a
    pts.push([x, y])
  }
  return pts
}
