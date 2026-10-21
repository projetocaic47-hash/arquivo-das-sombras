// Receitas dos efeitos sonoros, sintetizados na hora com Web Audio (sem arquivos e sem
// bibliotecas). Todos vêm do mesmo mundo: papel velho, couro, madeira, ferro enferrujado,
// cera e chama pequena. Nada de bipes de aplicativo.
//
// Técnica: a textura (ruído moldado, estalos, rangido por atrito) é calculada em JS num
// AudioBuffer curto, e depois passa por filtros do Web Audio. Cada toque sorteia pequenas
// variações (duração, cor, posição dos estalos) para não soar mecânico. As funções recebem
// o contexto e a saída, então servem tanto para tocar quanto para gravar (OfflineAudioContext).

export type Ctx = BaseAudioContext

export interface Voice {
  ctx: Ctx
  /** saída da voz (o motor liga ao volume geral e à sala) */
  out: AudioNode
  /** início, em segundos do contexto */
  t: number
  /** "reduzir animações": versões mais curtas onde a duração acompanha uma animação */
  reduced: boolean
}

/** Uma receita agenda os sons e devolve quanto tempo eles duram. */
export type Recipe = (v: Voice, opts?: Record<string, unknown>) => number

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
/** nunca zero: rampas exponenciais não aceitam 0 */
const Z = 0.0001

// ---------------------------------------------------------------- blocos

/**
 * Ruído moldado: `env(x)` dá o volume ao longo do tempo (x de 0 a 1); `rough` mistura uma
 * flutuação lenta e irregular (o "grão" do papel ou do pano); `grains` acrescenta estalos.
 */
function shapedNoise(
  ctx: Ctx,
  dur: number,
  env: (x: number) => number,
  o: { rough?: number; roughHz?: number; grains?: { at: number; amp: number; ms: number }[] } = {},
) {
  const sr = ctx.sampleRate
  const n = Math.max(1, Math.round(dur * sr))
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  const rough = o.rough ?? 0
  const k = 1 - Math.exp((-2 * Math.PI * (o.roughHz ?? 40)) / sr)
  let lp = 0
  let lp2 = 0
  for (let i = 0; i < n; i++) {
    // flutuação lenta: ruído passado duas vezes por um filtro de um polo
    lp += k * (Math.random() * 2 - 1 - lp)
    lp2 += k * (lp - lp2)
    const mod = 1 - rough + rough * Math.min(1.6, Math.abs(lp2) * 9)
    d[i] = (Math.random() * 2 - 1) * env(i / n) * mod
  }
  for (const g of o.grains || []) {
    const i0 = Math.floor(g.at * n)
    const len = Math.floor((g.ms / 1000) * sr)
    for (let j = 0; j < len && i0 + j < n; j++) d[i0 + j] += (Math.random() * 2 - 1) * g.amp * Math.exp((-j / len) * 5)
  }
  return buf
}

/**
 * Atrito que range (madeira, couro, dobradiça): uma sequência de pequenos golpes cujo ritmo
 * vira a altura do rangido. `rate(x)` em golpes por segundo; `amp(x)` o volume; `jitter`
 * deixa irregular (prende e solta).
 */
function stickSlip(ctx: Ctx, dur: number, rate: (x: number) => number, amp: (x: number) => number, jitter = 0.25, ring = 0.0016) {
  const sr = ctx.sampleRate
  const n = Math.max(1, Math.round(dur * sr))
  const buf = ctx.createBuffer(1, n, sr)
  const d = buf.getChannelData(0)
  const tail = Math.floor(ring * sr * 6)
  let t = 0
  while (t < dur) {
    const x = t / dur
    const a = amp(x) * (0.55 + Math.random() * 0.45)
    const i0 = Math.floor(t * sr)
    if (a > 0.002)
      for (let j = 0; j < tail && i0 + j < n; j++) d[i0 + j] += a * Math.exp(-j / (ring * sr)) * (j === 0 ? 1 : Math.random() * 1.4 - 0.7)
    const r = Math.max(4, rate(x) * (1 + (Math.random() - 0.5) * jitter))
    t += 1 / r
  }
  return buf
}

function play(v: Voice, buf: AudioBuffer, chain: AudioNode[], gain: number, at = 0) {
  const { ctx } = v
  const s = ctx.createBufferSource()
  s.buffer = buf
  const g = ctx.createGain()
  g.gain.value = gain
  let node: AudioNode = s
  for (const c of chain) {
    node.connect(c)
    node = c
  }
  node.connect(g)
  g.connect(v.out)
  s.start(v.t + at)
  return s
}

function bp(ctx: Ctx, f: number, q: number) {
  const b = ctx.createBiquadFilter()
  b.type = 'bandpass'
  b.frequency.value = f
  b.Q.value = q
  return b
}
function lp(ctx: Ctx, f: number, q = 0.7) {
  const b = ctx.createBiquadFilter()
  b.type = 'lowpass'
  b.frequency.value = f
  b.Q.value = q
  return b
}
function hp(ctx: Ctx, f: number, q = 0.7) {
  const b = ctx.createBiquadFilter()
  b.type = 'highpass'
  b.frequency.value = f
  b.Q.value = q
  return b
}

/** Várias ressonâncias em paralelo (o corpo de uma porta, de uma caixa, de um livro). */
function body(v: Voice, buf: AudioBuffer, modes: [freq: number, q: number, gain: number][], master: number, at = 0, pre?: AudioNode) {
  const { ctx } = v
  const s = ctx.createBufferSource()
  s.buffer = buf
  const sum = ctx.createGain()
  sum.gain.value = master
  let src: AudioNode = s
  if (pre) {
    s.connect(pre)
    src = pre
  }
  for (const [f, q, g] of modes) {
    const b = bp(ctx, f, q)
    const gg = ctx.createGain()
    gg.gain.value = g
    src.connect(b).connect(gg).connect(sum)
  }
  sum.connect(v.out)
  s.start(v.t + at)
}

/** Golpe abafado em madeira: um tom grave que cai e some depressa. */
function thump(v: Voice, at: number, f0: number, f1: number, dur: number, gain: number) {
  const { ctx } = v
  const o = ctx.createOscillator()
  o.type = 'sine'
  const g = ctx.createGain()
  const t = v.t + at
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(Z, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(Z, t + dur)
  o.connect(g).connect(v.out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

const decay = (x: number, k: number) => Math.exp(-x * k)
/** subida rápida e queda: curva de um gesto curto */
const swell = (x: number, peak: number, k = 2) => (x < peak ? Math.pow(x / peak, k) : Math.pow(1 - (x - peak) / (1 - peak), 1.6))

function grains(count: number, from: number, to: number, amp: [number, number], ms: [number, number]) {
  return Array.from({ length: count }, () => ({ at: rnd(from, to), amp: rnd(amp[0], amp[1]), ms: rnd(ms[0], ms[1]) }))
}

// ---------------------------------------------------------------- receitas

/** Folha de papel antigo virando: levanta, passa pelo ar e assenta. */
const pageTurn: Recipe = (v) => {
  const { ctx } = v
  const dur = rnd(0.5, 0.66)
  const land = rnd(0.62, 0.72)
  const buf = shapedNoise(
    ctx,
    dur,
    (x) => 0.55 * swell(Math.min(x / 0.5, 1), 0.45, 1.5) * (x < 0.5 ? 1 : 0.6) + (x > land - 0.08 ? 0.8 * swell((x - (land - 0.08)) / (1 - land + 0.08), 0.25) : 0),
    { rough: 0.55, roughHz: rnd(28, 45), grains: grains(Math.round(rnd(4, 8)), 0.05, 0.9, [0.25, 0.6], [2, 6]) },
  )
  const f = bp(ctx, rnd(2100, 2700), 0.6)
  f.frequency.setValueAtTime(f.frequency.value * 0.75, v.t)
  f.frequency.exponentialRampToValueAtTime(f.frequency.value * 1.5, v.t + dur * 0.45)
  f.frequency.exponentialRampToValueAtTime(f.frequency.value, v.t + dur)
  play(v, buf, [hp(ctx, 500), f, lp(ctx, 7500)], 0.42)
  // a folha toca as outras: um tapinha macio de papel
  const tap = shapedNoise(ctx, 0.06, (x) => decay(x, 6))
  play(v, tap, [lp(ctx, 900)], 0.12, dur * land)
  return dur
}

/** Uma folha passando depressa (ao pular para o índice ou outra história): uma por folha. */
const pageFlick: Recipe = (v) => {
  const { ctx } = v
  const dur = rnd(0.1, 0.14)
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.3), { rough: 0.4, grains: grains(2, 0.2, 0.8, [0.3, 0.5], [2, 4]) })
  play(v, buf, [hp(ctx, 900), bp(ctx, rnd(2600, 3400), 0.7)], 0.26)
  return dur
}

/** Folha erguida com o dedo (começo do arraste). */
const pageLift: Recipe = (v) => {
  const { ctx } = v
  const dur = 0.2
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.4), { rough: 0.6, grains: grains(2, 0.1, 0.7, [0.2, 0.35], [2, 4]) })
  play(v, buf, [hp(ctx, 600), bp(ctx, rnd(1600, 2000), 0.8)], 0.22)
  return dur
}

/** Folha que assenta ao soltar (concluída ou devolvida ao lugar). */
const pageLand: Recipe = (v) => {
  const { ctx } = v
  const dur = 0.16
  play(v, shapedNoise(ctx, dur, (x) => swell(x, 0.15) * 0.8, { rough: 0.5 }), [hp(ctx, 400), bp(ctx, 1500, 0.7)], 0.2)
  play(v, shapedNoise(ctx, 0.05, (x) => decay(x, 6)), [lp(ctx, 800)], 0.1, 0.06)
  return dur
}

/** Livro antigo abrindo: couro da lombada rangendo, estalos da costura, a capa no ar e as folhas assentando. */
const bookOpen: Recipe = (v) => {
  const { ctx } = v
  const creak = stickSlip(ctx, 0.5, (x) => 38 + x * 30, (x) => swell(x, 0.3) * 0.9, 0.5, 0.0022)
  body(v, creak, [[210, 5, 1], [470, 6, 0.7], [980, 5, 0.35]], 0.55, 0.02)
  play(v, shapedNoise(ctx, 0.45, () => 0, { grains: grains(6, 0.05, 0.9, [0.4, 0.9], [2, 5]) }), [bp(ctx, 1800, 0.9)], 0.3, 0.05)
  // a capa varre o ar
  const air = shapedNoise(ctx, 0.75, (x) => swell(x, 0.55, 1.4) * 0.7, { rough: 0.3, roughHz: 20 })
  const f = lp(ctx, 400)
  f.frequency.setValueAtTime(350, v.t + 0.25)
  f.frequency.exponentialRampToValueAtTime(1400, v.t + 0.75)
  f.frequency.exponentialRampToValueAtTime(500, v.t + 1)
  play(v, air, [hp(ctx, 120), f], 0.32, 0.25)
  // a capa encosta na mesa e as folhas se acomodam
  thump(v, 1.05, 120, 70, 0.16, 0.14)
  play(v, shapedNoise(ctx, 0.3, (x) => swell(x, 0.2), { rough: 0.5, grains: grains(3, 0.1, 0.8, [0.2, 0.4], [2, 4]) }), [hp(ctx, 700), bp(ctx, 2200, 0.7)], 0.18, 1.05)
  return 1.4
}

/** Livro fechando: as folhas e a capa passam pelo ar (o baque vem quando a capa chega). */
const bookClose: Recipe = (v) => {
  const { ctx } = v
  const dur = v.reduced ? 0.3 : 0.9
  const air = shapedNoise(ctx, dur, (x) => swell(x, 0.7, 1.6) * 0.8, { rough: 0.35, roughHz: 24, grains: grains(4, 0.1, 0.8, [0.15, 0.3], [2, 5]) })
  const f = lp(ctx, 500)
  f.frequency.setValueAtTime(500, v.t)
  f.frequency.exponentialRampToValueAtTime(1800, v.t + dur * 0.8)
  play(v, air, [hp(ctx, 150), f], 0.34)
  const creak = stickSlip(ctx, 0.35, (x) => 50 - x * 15, (x) => swell(x, 0.5) * 0.6, 0.5, 0.002)
  body(v, creak, [[230, 5, 1], [520, 6, 0.6]], 0.4, dur * 0.35)
  return dur
}

/** Capa pesada encostando na mesa de madeira. */
const bookThud: Recipe = (v) => {
  const { ctx } = v
  thump(v, 0, 95, 52, 0.32, 0.5)
  const hit = shapedNoise(ctx, 0.25, (x) => decay(x, 9))
  body(v, hit, [[140, 7, 1], [260, 8, 0.6], [520, 6, 0.25]], 0.6, 0, lp(ctx, 1200))
  // o ar que escapa das folhas
  play(v, shapedNoise(ctx, 0.22, (x) => decay(x, 5), { rough: 0.4 }), [hp(ctx, 300), lp(ctx, 2200)], 0.16, 0.01)
  return 0.45
}

/** Nós dos dedos numa porta grossa de madeira, num corredor. */
const doorKnock: Recipe = (v) => {
  const { ctx } = v
  const p = rnd(0.94, 1.06)
  const hit = shapedNoise(ctx, 0.3, (x) => decay(x, 14) + (x < 0.01 ? 2 : 0))
  body(v, hit, [[105 * p, 10, 1], [168 * p, 9, 0.8], [290 * p, 8, 0.5], [610 * p, 5, 0.18]], 1.25, 0, lp(ctx, 2500))
  thump(v, 0, 120 * p, 75 * p, 0.14, 0.32)
  // o estalo dos nós dos dedos
  play(v, shapedNoise(ctx, 0.008, (x) => decay(x, 4)), [hp(ctx, 1500)], 0.2)
  return 0.4
}

/** Fósforo riscado e a chama pequena pegando no pavio. */
const ignite: Recipe = (v) => {
  const { ctx } = v
  const scratch = shapedNoise(ctx, 0.16, (x) => swell(x, 0.35), { rough: 0.85, roughHz: 120, grains: grains(5, 0, 1, [0.4, 0.8], [1, 3]) })
  play(v, scratch, [hp(ctx, 1200), bp(ctx, 3200, 0.8)], 0.3)
  // o "fuu" curto da cabeça do fósforo pegando fogo
  const flare = shapedNoise(ctx, 0.45, (x) => swell(x, 0.12, 1.2) * 0.9, { rough: 0.5, roughHz: 30 })
  const f = lp(ctx, 900)
  f.frequency.setValueAtTime(700, v.t + 0.12)
  f.frequency.exponentialRampToValueAtTime(2400, v.t + 0.2)
  f.frequency.exponentialRampToValueAtTime(500, v.t + 0.55)
  play(v, flare, [hp(ctx, 120), f], 0.3, 0.12)
  // a chama assenta, com dois estalinhos de cera
  play(v, shapedNoise(ctx, 0.5, () => 0, { grains: grains(3, 0.2, 0.9, [0.3, 0.6], [1, 3]) }), [bp(ctx, 2600, 1)], 0.16, 0.35)
  return 0.9
}

/** Cartaz de madeira na parede: a moldura estala e um pouco de pó escorre. */
const posterCreak: Recipe = (v) => {
  const { ctx } = v
  const creak = stickSlip(ctx, 0.42, (x) => 60 + Math.sin(x * Math.PI) * 40, (x) => swell(x, 0.35) * 0.8, 0.45, 0.0018)
  body(v, creak, [[320, 6, 1], [690, 6, 0.6], [1350, 5, 0.25]], 0.45)
  // pó caindo: estalinhos finos e espaçados
  play(v, shapedNoise(ctx, 1, () => 0, { grains: grains(10, 0.1, 0.75, [0.15, 0.35], [1, 2]) }), [hp(ctx, 2500), lp(ctx, 7000)], 0.12, 0.2)
  return 1.2
}

/**
 * Dobradiças enferrujadas de uma porta pesada abrindo devagar, no ritmo da animação: um
 * estalo e um rangido curto quando ela desprende, uma pausa, e o rangido longo enquanto
 * ela abre (a altura sobe e desce com a velocidade).
 */
const doorHinges: Recipe = (v) => {
  const { ctx } = v
  if (v.reduced) {
    const c = stickSlip(ctx, 0.9, (x) => 160 + x * 60, (x) => swell(x, 0.3) * 0.5, 0.2, 0.0012)
    body(v, c, [[700, 4, 1], [1500, 4, 0.5]], 0.35, 0, lp(ctx, 3200))
    return 1
  }
  doorUnlatch(v)
  doorCreak({ ...v, t: v.t + 1.0 })
  return 4.5
}

/** A porta desprende: um tranco seco na madeira e um rangido curto (início da abertura). */
const doorUnlatch: Recipe = (v) => {
  const { ctx } = v
  const hit = shapedNoise(ctx, 0.2, (x) => decay(x, 12))
  body(v, hit, [[120, 8, 1], [240, 8, 0.6], [470, 6, 0.3]], 0.7, 0.05, lp(ctx, 1400))
  const short = stickSlip(ctx, 0.5, (x) => 120 + x * 140, (x) => swell(x, 0.4) * 0.7, 0.3, 0.0011)
  body(v, short, [[650, 5, 1], [1300, 5, 0.55], [2600, 4, 0.2]], 0.42, 0.15, lp(ctx, 3500))
  return 0.7
}

/**
 * O rangido longo enquanto a porta abre (a altura sobe e desce com a velocidade). Quando
 * existe a gravação real (public/sons/porta-abrindo.mp3), ela toca no lugar deste.
 */
const doorCreak: Recipe = (v) => {
  const { ctx } = v
  const long = stickSlip(
    ctx,
    3.4,
    (x) => 140 + 260 * Math.sin(Math.min(1, x * 1.3) * Math.PI * 0.5) - 120 * Math.max(0, x - 0.7),
    (x) => swell(x, 0.35, 1.3) * (0.8 + 0.2 * Math.sin(x * 23)),
    0.22,
    0.001,
  )
  body(v, long, [[620, 5, 1], [1250, 5, 0.6], [2400, 4, 0.22]], 0.42, 0, lp(ctx, 3600))
  // a madeira geme por baixo
  const groan = stickSlip(ctx, 3.0, (x) => 32 + x * 14, (x) => swell(x, 0.4) * 0.7, 0.5, 0.003)
  body(v, groan, [[110, 6, 1], [240, 6, 0.5]], 0.4, 0.1)
  return 3.5
}

/** Caixa de fichas (Acervo): a tampa de madeira desliza e encosta. */
const boxOpen: Recipe = (v) => {
  const { ctx } = v
  const slide = stickSlip(ctx, 0.32, () => rnd(70, 90), (x) => swell(x, 0.3) * 0.7, 0.8, 0.0025)
  body(v, slide, [[260, 4, 1], [600, 4, 0.5], [1300, 3, 0.2]], 0.5, 0, lp(ctx, 2200))
  play(v, shapedNoise(ctx, 0.3, (x) => swell(x, 0.4) * 0.6, { rough: 0.5 }), [bp(ctx, 900, 0.6)], 0.12)
  const knock = shapedNoise(ctx, 0.15, (x) => decay(x, 14))
  body(v, knock, [[240, 9, 1], [520, 8, 0.5]], 0.7, 0.3)
  return 0.5
}

/** Tampa da caixa fechando: um toque de madeira, mais curto. */
const boxClose: Recipe = (v) => {
  const { ctx } = v
  const knock = shapedNoise(ctx, 0.15, (x) => decay(x, 13))
  body(v, knock, [[210, 9, 1], [460, 8, 0.45]], 0.65)
  return 0.25
}

/** Ajustes (a vela): um sopro na chama, que tremula e volta. */
const candleBreath: Recipe = (v) => {
  const { ctx } = v
  const dur = 0.55
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.25) * (0.75 + 0.25 * Math.sin(x * 40)), { rough: 0.5, roughHz: 14, grains: grains(2, 0.3, 0.9, [0.2, 0.35], [1, 3]) })
  play(v, buf, [hp(ctx, 90), lp(ctx, 650)], 0.42)
  return dur
}

/** Folha pega da mesa (folhas soltas, nova folha, recuperar, duplicar). */
const paperPick: Recipe = (v) => {
  const { ctx } = v
  const dur = rnd(0.22, 0.28)
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.3) * 0.8 + (x > 0.55 ? 0.35 * swell((x - 0.55) / 0.45, 0.3) : 0), {
    rough: 0.55,
    grains: grains(3, 0.05, 0.85, [0.2, 0.45], [2, 5]),
  })
  play(v, buf, [hp(ctx, 500), bp(ctx, rnd(1900, 2400), 0.7)], 0.24)
  return dur
}

/** Folha posta sobre a mesa ou no livro (enviar ao livro, deixar na mesa). */
const paperPlace: Recipe = (v) => {
  const { ctx } = v
  const dur = 0.3
  play(v, shapedNoise(ctx, dur, (x) => swell(x, 0.55, 1.4) * 0.7, { rough: 0.4 }), [hp(ctx, 300), bp(ctx, 1300, 0.6)], 0.22)
  play(v, shapedNoise(ctx, 0.07, (x) => decay(x, 6)), [lp(ctx, 700)], 0.16, dur * 0.6)
  return dur + 0.05
}

/** Pena no tinteiro (abrir o editor): um toque leve no vidro e a ponta raspando. */
const quillDip: Recipe = (v) => {
  const { ctx } = v
  const t = v.t
  for (const [f, a, d] of [
    [2240, 0.05, 0.12],
    [3410, 0.025, 0.09],
    [5230, 0.012, 0.06],
  ] as const) {
    const o = ctx.createOscillator()
    o.frequency.value = f * rnd(0.98, 1.02)
    const g = ctx.createGain()
    g.gain.setValueAtTime(Z, t)
    g.gain.exponentialRampToValueAtTime(a, t + 0.003)
    g.gain.exponentialRampToValueAtTime(Z, t + d)
    o.connect(g).connect(v.out)
    o.start(t)
    o.stop(t + d + 0.02)
  }
  const scratch = shapedNoise(ctx, 0.14, (x) => swell(x, 0.5), { rough: 0.8, roughHz: 90 })
  play(v, scratch, [hp(ctx, 2000), bp(ctx, 4200, 1.2)], 0.1, 0.18)
  return 0.35
}

/** Fechar uma janela: um assentar macio, sem materialidade demais. */
const panelClose: Recipe = (v) => {
  const { ctx } = v
  play(v, shapedNoise(ctx, 0.18, (x) => swell(x, 0.35) * 0.6, { rough: 0.3 }), [hp(ctx, 200), lp(ctx, 1100)], 0.2)
  return 0.2
}

/** Uma pergunta aparece: toque grave e curto de madeira. */
const dialogOpen: Recipe = (v) => {
  const { ctx } = v
  const knock = shapedNoise(ctx, 0.2, (x) => decay(x, 12))
  body(v, knock, [[160, 8, 1], [330, 7, 0.4]], 0.5, 0, lp(ctx, 900))
  return 0.25
}

/** Cancelar / manter: o mesmo toque, mais baixo e mais leve. */
const dialogCancel: Recipe = (v) => {
  const { ctx } = v
  const knock = shapedNoise(ctx, 0.15, (x) => decay(x, 14))
  body(v, knock, [[128, 8, 1], [270, 7, 0.3]], 0.3, 0, lp(ctx, 700))
  return 0.2
}

/** Papel amassado (mandar para a lixeira). */
const crumple: Recipe = (v) => {
  const { ctx } = v
  const dur = rnd(0.5, 0.62)
  // três apertos da mão, cada um com uma rajada de estalos
  const g = [0.05, 0.3, 0.55].flatMap((c) => grains(Math.round(rnd(9, 14)), c, c + 0.2, [0.35, 0.9], [1, 5]))
  const buf = shapedNoise(ctx, dur, (x) => 0.18 * (swell(x, 0.15) + 0.6 * Math.max(0, Math.sin(x * Math.PI * 3))), { rough: 0.7, roughHz: 60, grains: g })
  play(v, buf, [hp(ctx, 600), bp(ctx, 2400, 0.5), lp(ctx, 7000)], 0.42)
  return dur
}

/** Papel rasgando (excluir de vez): firme, curto, sem drama. */
const tear: Recipe = (v) => {
  const { ctx } = v
  const dur = rnd(0.4, 0.5)
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.2, 1) * (0.6 + 0.4 * Math.sin(x * 140 + Math.random())), { rough: 0.85, roughHz: 160 })
  const f = bp(ctx, 1500, 0.9)
  f.frequency.setValueAtTime(1300, v.t)
  f.frequency.exponentialRampToValueAtTime(3400, v.t + dur)
  play(v, buf, [hp(ctx, 500), f], 0.45)
  return dur
}

/** Lacre de cera pressionado (backup): baque macio e a cera cedendo. */
const sealStamp: Recipe = (v) => {
  const { ctx } = v
  thump(v, 0, 140, 80, 0.18, 0.28)
  const hit = shapedNoise(ctx, 0.12, (x) => decay(x, 10))
  body(v, hit, [[300, 5, 1], [700, 4, 0.4]], 0.4, 0, lp(ctx, 1500))
  play(v, shapedNoise(ctx, 0.16, (x) => swell(x, 0.3) * 0.6, { rough: 0.6, roughHz: 50 }), [bp(ctx, 850, 1.2)], 0.14, 0.05)
  return 0.3
}

/** Fita de seda do marcador deslizando entre as páginas (sobe ao marcar, desce ao desmarcar). */
const ribbon: Recipe = (v, o) => {
  const { ctx } = v
  const up = !(o && o.down)
  const dur = 0.28
  const buf = shapedNoise(ctx, dur, (x) => swell(x, 0.45, 1.4), { rough: 0.35, roughHz: 30 })
  const f = bp(ctx, 2000, 1.8)
  f.frequency.setValueAtTime(up ? 1600 : 3200, v.t)
  f.frequency.exponentialRampToValueAtTime(up ? 3200 : 1600, v.t + dur)
  play(v, buf, [f], 0.26)
  return dur
}

/** Clique pequeno de madeira (ordem, favorito, opções). `on: false` soa um pouco mais grave. */
const tick: Recipe = (v, o) => {
  const { ctx } = v
  const k = o && o.on === false ? 0.82 : 1
  const hit = shapedNoise(ctx, 0.06, (x) => decay(x, 16))
  body(v, hit, [[880 * k, 7, 1], [1900 * k, 6, 0.35]], 0.42)
  return 0.08
}

/** Algo deu errado: duas batidas surdas, graves, sem alarme. */
const errorKnock: Recipe = (v) => {
  const { ctx } = v
  for (const at of [0, 0.11]) {
    const hit = shapedNoise(ctx, 0.12, (x) => decay(x, 14))
    body(v, hit, [[135, 8, 1], [250, 7, 0.35]], 0.55, at, lp(ctx, 700))
  }
  return 0.3
}

export const RECIPES = {
  'page.turn': pageTurn,
  'page.flick': pageFlick,
  'page.lift': pageLift,
  'page.land': pageLand,
  'book.open': bookOpen,
  'book.close': bookClose,
  'book.thud': bookThud,
  'door.knock': doorKnock,
  'door.ignite': ignite,
  'door.poster': posterCreak,
  'door.hinges': doorHinges,
  'door.unlatch': doorUnlatch,
  'door.creak': doorCreak,
  'box.open': boxOpen,
  'box.close': boxClose,
  'candle.breath': candleBreath,
  'paper.pick': paperPick,
  'paper.place': paperPlace,
  'quill.dip': quillDip,
  'panel.close': panelClose,
  'dialog.open': dialogOpen,
  'dialog.cancel': dialogCancel,
  'paper.crumple': crumple,
  'paper.tear': tear,
  'seal.stamp': sealStamp,
  'ribbon.mark': ribbon,
  'ui.tick': tick,
  'ui.error': errorKnock,
} satisfies Record<string, Recipe>

export type SoundName = keyof typeof RECIPES
