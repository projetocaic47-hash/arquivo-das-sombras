// Estado atmosférico compartilhado pela cena, atualizado uma vez por quadro.
// A chama (visual) e a luz da vela leem o MESMO valor de cintilação, por isso andam juntas.

/** Ruído suave 1D (valor interpolado), determinístico. */
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}
export function noise1(x: number) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u - 0.5 // [-0.5, 0.5]
}

export const atmosphere = {
  time: 0,
  /** multiplicador de intensidade da vela (~0.8 a 1.12) */
  flicker: 1,
  /** deslocamento lateral do topo da chama, em fração da largura */
  sway: 0,
  /** alongamento vertical da chama (~0.9 a 1.1) */
  stretch: 1,
  /** brilho do relâmpago agora (0 = nada, até ~1.5) */
  lightning: 0,
  /** posição horizontal do raio no céu (-1 a 1) */
  boltX: 0,
  /** semente do desenho do raio atual */
  boltSeed: 0,
  /** conta os relâmpagos: muda no instante do primeiro clarão (o trovão do som se guia por ele) */
  strikes: 0,
  /** força do relâmpago atual (número de clarões, 2 a 4) */
  strikePower: 0,
  reducedMotion: false,
  /** usado só em testes visuais: fixa o relâmpago num valor (negativo = automático) */
  forceLightning: -1,
}

// rajadas: de tempos em tempos a chama dança mais
let gustStart = -100
let nextGust = 5
// relâmpagos: série de 2 a 4 clarões em ~0,5 s
let nextStrike = 4
let strike: { t0: number; pulses: number[] } | null = null

export function updateAtmosphere(t: number, dt: number) {
  const a = atmosphere
  a.time = t
  const calm = a.reducedMotion ? 0.3 : 1

  if (t > nextGust) {
    gustStart = t
    nextGust = t + 6 + hash(t) * 10
  }
  const g = t - gustStart
  const gust = g < 1.6 ? Math.sin((g / 1.6) * Math.PI) : 0

  const n1 = noise1(t * 1.1), n2 = noise1(t * 6.3 + 17), n3 = noise1(t * 15.7 + 41)
  a.flicker = 1 + calm * (0.07 * n1 + 0.05 * n2 + 0.025 * n3 - gust * 0.12 * (0.5 + noise1(t * 11)))
  a.sway = calm * (0.12 * noise1(t * 0.9 + 5) + 0.05 * n2 + gust * 0.5 * noise1(t * 4.3 + 9))
  a.stretch = 1 + calm * (0.05 * n1 + 0.04 * n3 + gust * 0.12 * noise1(t * 7 + 3))

  if (!strike && t > nextStrike) {
    const n = 2 + Math.floor(hash(t * 3) * 3)
    const pulses: number[] = []
    let at = 0
    for (let i = 0; i < n; i++) {
      pulses.push(at)
      at += 0.06 + hash(t + i) * 0.16
    }
    strike = { t0: t, pulses }
    a.strikes++
    a.strikePower = n
    a.boltX = hash(t * 7) * 1.6 - 0.8
    a.boltSeed = Math.floor(hash(t * 13) * 1000)
    nextStrike = t + (a.reducedMotion ? 30 : 7) + hash(t * 5) * 14
  }
  let L = 0
  if (strike) {
    const s = t - strike.t0
    strike.pulses.forEach((p, i) => {
      const d = s - p
      if (d >= 0) L = Math.max(L, (i === 0 ? 1.4 : 1) * Math.exp(-d * 9) * (d < 0.02 ? d / 0.02 : 1))
    })
    if (s > strike.pulses[strike.pulses.length - 1] + 1) strike = null
  }
  a.lightning = a.forceLightning >= 0 ? a.forceLightning : L * (a.reducedMotion ? 0.35 : 1)
  void dt
}
