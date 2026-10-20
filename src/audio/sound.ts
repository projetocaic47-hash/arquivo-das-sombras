// Som do quarto: chuva constante, trovões junto com os relâmpagos da janela,
// piano lento e melancólico e o som da escrita (máquina de escrever ou lápis).
// Chuva, trovão e escrita são sintetizados na hora (Web Audio); o piano usa
// amostras do Salamander Grand Piano (Alexander Holm, CC BY 3.0) tocadas por
// um compositor que nunca repete a mesma sequência.
// Os navegadores só liberam o áudio depois de um clique ou tecla: até lá, nada toca.

export type WritingSound = 'maquina' | 'lapis' | 'nenhum'

export interface SoundPrefs {
  /** som ligado */
  on: boolean
  /** piano ligado */
  music: boolean
  writing: WritingSound
  /** volume geral, 0 a 1 */
  volume: number
}

const PREFS_KEY = 'arquivo-das-sombras:som'
export const DEFAULT_PREFS: SoundPrefs = { on: true, music: true, writing: 'maquina', volume: 0.8 }

// Preferências de som ficam neste aparelho (localStorage), fora do banco das histórias.
function loadPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    // armazenamento bloqueado (janela anônima, prévia): usa o padrão
  }
  return { ...DEFAULT_PREFS }
}

function savePrefs(p: SoundPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** Ruído com cor: 0 = branco, 1 = rosa (mais grave), 2 = marrom (estrondo). */
function noiseBuffer(ac: BaseAudioContext, seconds: number, color: 0 | 1 | 2, channels = 1) {
  const n = Math.floor(ac.sampleRate * seconds)
  const b = ac.createBuffer(channels, n, ac.sampleRate)
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c)
    let b0 = 0, b1 = 0, b2 = 0, last = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      if (color === 0) d[i] = w
      else if (color === 1) {
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16
      } else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    // emenda suave do laço: o fim desliza para o começo
    const fade = Math.min(n >> 3, 4000)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k
    }
  }
  return b
}

/** Gotas na vidraça: estalos curtos e agudos espalhados ao acaso, em estéreo. */
function dropsBuffer(ac: BaseAudioContext, seconds: number) {
  const n = Math.floor(ac.sampleRate * seconds)
  const b = ac.createBuffer(2, n, ac.sampleRate)
  const L = b.getChannelData(0)
  const R = b.getChannelData(1)
  const count = Math.floor(seconds * 70)
  for (let k = 0; k < count; k++) {
    const at = Math.floor(Math.random() * (n - 2000))
    const f = rnd(2200, 7000)
    const len = Math.floor(rnd(0.004, 0.018) * ac.sampleRate)
    const amp = Math.pow(Math.random(), 2.5) * 0.5
    const pan = Math.random()
    for (let i = 0; i < len; i++) {
      const env = Math.exp((-i / len) * 6)
      const v = Math.sin((2 * Math.PI * f * i) / ac.sampleRate) * env * amp * (Math.random() * 0.6 + 0.4)
      L[at + i] += v * (1 - pan)
      R[at + i] += v * pan
    }
  }
  return b
}

/** Resposta de sala comprida e escura para o piano (reverberação). */
function impulse(ac: BaseAudioContext, seconds: number) {
  const n = Math.floor(ac.sampleRate * seconds)
  const b = ac.createBuffer(2, n, ac.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    let lp = 0
    for (let i = 0; i < n; i++) {
      const t = i / n
      lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18
      d[i] = lp * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1)
    }
  }
  return b
}

// ---------- piano ----------

const SAMPLE_NOTES = ['A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6']
const NAME_TO_PC: Record<string, number> = { C: 0, Ds: 3, Fs: 6, A: 9 }
const midiOf = (name: string) => {
  const m = /^([A-Z]s?)(\d)$/.exec(name)!
  return 12 * (Number(m[2]) + 1) + NAME_TO_PC[m[1]]
}

// Progressões em lá menor, lentas: cada acorde dura um compasso.
// Notas MIDI: baixo e tríade.
const CHORDS: Record<string, { bass: number; tones: number[] }> = {
  Am: { bass: 45, tones: [57, 60, 64] },
  F: { bass: 41, tones: [57, 60, 65] },
  C: { bass: 48, tones: [55, 60, 64] },
  G: { bass: 43, tones: [55, 59, 62] },
  Dm: { bass: 50, tones: [57, 62, 65] },
  E: { bass: 40, tones: [56, 59, 64] },
  Em: { bass: 40, tones: [55, 59, 64] },
}
const PROGRESSIONS = [
  ['Am', 'F', 'C', 'G'],
  ['Am', 'Dm', 'E', 'Am'],
  ['F', 'G', 'Em', 'Am'],
  ['Am', 'C', 'Dm', 'E'],
  ['Dm', 'Am', 'F', 'E'],
]
const SCALE = [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76] // lá menor natural (+ sétima aumentada no acorde de mi)

class Piano {
  private buffers = new Map<number, AudioBuffer>()
  get loaded() {
    return this.buffers.size
  }
  private loading: Promise<void> | null = null
  private timer = 0
  private next = 0
  private bar = 0
  private prog = PROGRESSIONS[0]
  private melody = 69
  private ctx: AudioContext
  private out: AudioNode

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx
    this.out = out
  }

  load() {
    this.loading ??= Promise.all(
      SAMPLE_NOTES.map(async (n) => {
        const r = await fetch(`./audio/piano/${n}.mp3`)
        if (!r.ok) throw new Error(n)
        this.buffers.set(midiOf(n), await this.ctx.decodeAudioData(await r.arrayBuffer()))
      }),
    ).then(() => undefined)
    return this.loading
  }

  /** Toca uma nota no instante `at` (relógio do áudio). */
  note(midi: number, at: number, vel: number, len: number) {
    let best = -1
    for (const m of this.buffers.keys()) if (best < 0 || Math.abs(m - midi) < Math.abs(best - midi)) best = m
    const buf = this.buffers.get(best)
    if (!buf) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = Math.pow(2, (midi - best) / 12)
    const g = this.ctx.createGain()
    const v = 0.18 + vel * 0.5
    g.gain.setValueAtTime(v, at)
    // abafa devagar, como o pedal sendo solto
    g.gain.setValueAtTime(v, at + len)
    g.gain.exponentialRampToValueAtTime(0.0008, at + len + 2.5)
    src.connect(g)
    g.connect(this.out)
    src.start(at)
    src.stop(at + len + 2.6)
  }

  start() {
    if (this.timer) return
    this.load()
      .then(() => {
        if (this.timer) return
        this.next = this.ctx.currentTime + 1.5
        this.bar = 0
        this.timer = window.setInterval(() => this.schedule(), 250)
      })
      .catch(() => {
        // sem amostras (rede ou arquivo ausente): o quarto segue só com a chuva
      })
  }

  stop() {
    clearInterval(this.timer)
    this.timer = 0
  }

  private schedule() {
    // compõe sempre ~1,5 s à frente do que está tocando
    while (this.next < this.ctx.currentTime + 1.5) this.composeBar(this.next)
  }

  /** Um compasso lento (4 tempos a ~50 bpm), com ar entre as notas. */
  private composeBar(t0: number) {
    const beat = rnd(1.12, 1.24)
    if (this.bar % 8 === 0) this.prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]
    const phraseEnd = this.bar % 8 === 7
    const ch = CHORDS[this.prog[this.bar % 4]]
    const hum = () => rnd(-0.025, 0.025)
    // às vezes o piano descansa um compasso inteiro
    if (!(phraseEnd && Math.random() < 0.35)) {
      this.note(ch.bass, t0 + hum(), rnd(0.35, 0.5), beat * 3.6)
      if (Math.random() < 0.6) this.note(ch.bass + 12, t0 + beat * 0.5 + hum(), rnd(0.2, 0.3), beat * 3)
      // acorde quebrado, devagar
      const order = Math.random() < 0.5 ? [0, 1, 2, 1] : [0, 2, 1, 2]
      order.forEach((k, i) => {
        if (Math.random() < 0.82) this.note(ch.tones[k], t0 + beat * (1 + i * 0.75) + hum(), rnd(0.18, 0.3), beat * 2)
      })
      // melodia: poucas notas, passos pequenos, puxando para notas do acorde
      const notes = Math.random() < 0.45 ? 1 : Math.random() < 0.6 ? 2 : 0
      for (let i = 0; i < notes; i++) {
        const i0 = SCALE.indexOf(this.melody)
        const j = Math.max(0, Math.min(SCALE.length - 1, (i0 < 0 ? 6 : i0) + Math.round(rnd(-2.4, 2.4))))
        // no acorde de mi, o sol vira sol sustenido
        let m = SCALE[j] + 12
        if (this.prog[this.bar % 4] === 'E' && m % 12 === 7) m += 1
        if (phraseEnd && i === notes - 1) m = 69 + 12 // fim de frase volta ao lá
        this.melody = SCALE[j]
        this.note(m, t0 + beat * (i === 0 ? rnd(0.9, 1.6) : rnd(2.4, 3.1)) + hum(), rnd(0.25, 0.42), beat * 1.8)
      }
    }
    this.next = t0 + beat * 4
    this.bar++
  }
}

// ---------- motor ----------

class SoundEngine {
  prefs: SoundPrefs = loadPrefs()
  private ctx: AudioContext | null = null
  private master!: GainNode
  private rainBus!: GainNode
  private musicBus!: GainNode
  private sfx!: GainNode
  private piano: Piano | null = null
  private rainNodes: AudioScheduledSourceNode[] = []
  private noise: { white: AudioBuffer; brown: AudioBuffer } | null = null
  private lastKey = 0
  private meter: AnalyserNode | null = null
  /** editor aberto: a chuva recua um pouco para a escrita aparecer */
  private writing = false

  setWriting(on: boolean) {
    this.writing = on
    this.apply()
  }
  private listeners = new Set<() => void>()

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getPrefs = () => this.prefs

  setPrefs(p: Partial<SoundPrefs>) {
    this.prefs = { ...this.prefs, ...p }
    savePrefs(this.prefs)
    this.apply()
    this.listeners.forEach((l) => l())
  }

  /** Chamado num clique ou tecla do usuário: só aí o navegador deixa o áudio começar. */
  unlock() {
    if (!this.prefs.on) return
    if (!this.ctx) this.build()
    if (this.ctx!.state === 'suspended') this.ctx!.resume().catch(() => {})
    this.apply()
  }

  private build() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new Ctx()
    this.ctx = ac
    this.master = ac.createGain()
    // limitador leve para trovões fortes não estourarem
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.ratio.value = 6
    this.master.connect(comp)
    comp.connect(ac.destination)
    this.meter = ac.createAnalyser()
    this.meter.fftSize = 2048
    comp.connect(this.meter)
    this.rainBus = ac.createGain()
    this.rainBus.connect(this.master)
    this.sfx = ac.createGain()
    this.sfx.gain.value = 3
    this.sfx.connect(this.master)
    // piano: abafado (feltro) e distante, numa sala com eco longo
    this.musicBus = ac.createGain()
    const felt = ac.createBiquadFilter()
    felt.type = 'lowpass'
    felt.frequency.value = 2600
    const rev = ac.createConvolver()
    rev.buffer = impulse(ac, 4.5)
    const wet = ac.createGain()
    wet.gain.value = 0.55
    const dry = ac.createGain()
    dry.gain.value = 0.6
    felt.connect(dry)
    felt.connect(rev)
    rev.connect(wet)
    dry.connect(this.musicBus)
    wet.connect(this.musicBus)
    this.musicBus.connect(this.master)
    this.piano = new Piano(ac, felt)
    this.noise = { white: noiseBuffer(ac, 3, 0), brown: noiseBuffer(ac, 6, 2) }
  }

  private startRain() {
    const ac = this.ctx!
    if (this.rainNodes.length) return
    const add = (buf: AudioBuffer, type: BiquadFilterType, freq: number, gain: number, q = 0.7) => {
      const s = ac.createBufferSource()
      s.buffer = buf
      s.loop = true
      const f = ac.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ac.createGain()
      g.gain.value = gain
      s.connect(f)
      f.connect(g)
      g.connect(this.rainBus)
      s.start(ac.currentTime + Math.random())
      this.rainNodes.push(s)
      return g
    }
    // chiado da chuva no telhado e na rua
    add(noiseBuffer(ac, 5, 1, 2), 'lowpass', 2600, 0.5)
    add(noiseBuffer(ac, 4, 0, 2), 'bandpass', 5200, 0.05, 0.5)
    // ronco grave, longe
    add(noiseBuffer(ac, 7, 2), 'lowpass', 260, 0.35)
    // gotas na vidraça
    add(dropsBuffer(ac, 9), 'highpass', 1200, 0.55)
    // a chuva engrossa e afina devagar
    const lfo = ac.createOscillator()
    lfo.frequency.value = 1 / 23
    const depth = ac.createGain()
    depth.gain.value = 0.1
    lfo.connect(depth)
    depth.connect(this.rainBus.gain)
    lfo.start()
    this.rainNodes.push(lfo)
  }

  private stopRain() {
    this.rainNodes.forEach((n) => n.stop())
    this.rainNodes = []
  }

  private apply() {
    const ac = this.ctx
    if (!ac) return
    const p = this.prefs
    const now = ac.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(p.on ? p.volume : 0, now, 0.4)
    this.rainBus.gain.setTargetAtTime(this.writing ? 0.26 : 0.42, now, 0.6)
    this.musicBus.gain.setTargetAtTime(p.music ? 0.75 : 0, now, 0.8)
    if (p.on) {
      this.startRain()
      if (p.music) this.piano!.start()
      else this.piano!.stop()
    } else {
      // desliga de vez depois do fade, para não gastar bateria
      this.piano!.stop()
      setTimeout(() => {
        if (!this.prefs.on) this.stopRain()
      }, 2000)
    }
  }

  /**
   * Trovão do relâmpago que acabou de clarear a janela. O som vem logo depois do clarão
   * (a luz chega antes), mais forte e mais perto quando o relâmpago tem mais clarões.
   */
  thunder(power: number, pan: number) {
    const ac = this.ctx
    if (!ac || !this.prefs.on || !this.noise || ac.state !== 'running') return
    const close = (power - 2) / 2 // 0 longe, 1 perto
    const t = ac.currentTime + rnd(0.15, 0.45) + (1 - close) * rnd(0.3, 0.9)
    const dur = rnd(4, 6.5)
    const out = ac.createStereoPanner()
    out.pan.value = Math.max(-0.8, Math.min(0.8, pan))
    out.connect(this.master)

    // estalo inicial (só nos próximos)
    if (close > 0.3) {
      const s = ac.createBufferSource()
      s.buffer = this.noise.white
      const f = ac.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1400
      f.Q.value = 0.4
      const g = ac.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.5 * close, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      s.connect(f)
      f.connect(g)
      g.connect(out)
      s.start(t, Math.random())
      s.stop(t + 0.4)
    }
    // estrondo que rola: ruído marrom com o filtro fechando e várias ondas de volume
    const s = ac.createBufferSource()
    s.buffer = this.noise.brown
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(700 + close * 900, t)
    f.frequency.exponentialRampToValueAtTime(90, t + dur)
    const g = ac.createGain()
    const peak = 1.1 + close * 0.9
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.12 + (1 - close) * 0.5)
    let at = t + 0.5
    while (at < t + dur - 1) {
      g.gain.linearRampToValueAtTime(peak * rnd(0.35, 0.9) * (1 - (at - t) / dur), at)
      at += rnd(0.25, 0.7)
    }
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    s.connect(f)
    f.connect(g)
    g.connect(out)
    s.start(t, Math.random() * 2)
    s.stop(t + dur + 0.1)
  }

  /** Para os testes automáticos: nível do som que sai agora (RMS) e estado do áudio. */
  probe() {
    let rms = 0
    if (this.meter) {
      const d = new Float32Array(this.meter.fftSize)
      this.meter.getFloatTimeDomainData(d)
      rms = Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length)
    }
    return { state: this.ctx?.state ?? 'none', rms, piano: this.piano?.loaded ?? 0, rain: this.rainNodes.length }
  }

  /** Som de uma tecla no editor. */
  key(kind: 'char' | 'space' | 'enter' | 'delete') {
    const ac = this.ctx
    const w = this.prefs.writing
    if (!ac || !this.prefs.on || w === 'nenhum' || !this.noise || ac.state !== 'running') return
    const now = ac.currentTime
    // digitação muito rápida: no máximo um som a cada 25 ms
    if (now - this.lastKey < 0.025 && kind === 'char') return
    this.lastKey = now
    if (w === 'maquina') this.typewriter(kind, now)
    else this.pencil(kind, now)
  }

  private burst(t: number, type: BiquadFilterType, freq: number, q: number, gain: number, len: number, offset = Math.random() * 2) {
    const ac = this.ctx!
    const s = ac.createBufferSource()
    s.buffer = this.noise!.white
    const f = ac.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    s.connect(f)
    f.connect(g)
    g.connect(this.sfx)
    s.start(t, offset)
    s.stop(t + len + 0.02)
  }

  private thunk(t: number, freq: number, gain: number, len: number) {
    const ac = this.ctx!
    const o = ac.createOscillator()
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + len)
    const g = ac.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    o.connect(g)
    g.connect(this.sfx)
    o.start(t)
    o.stop(t + len + 0.02)
  }

  private typewriter(kind: 'char' | 'space' | 'enter' | 'delete', t: number) {
    if (kind === 'enter') {
      // alavanca do carro: catraca, deslizar e a campainha
      for (let i = 0; i < 7; i++) this.burst(t + i * 0.028, 'bandpass', 3000 + i * 120, 4, 0.12, 0.02)
      this.burst(t + 0.2, 'bandpass', 900, 0.8, 0.18, 0.35)
      const ac = this.ctx!
      for (const [f, a] of [
        [2093, 0.12],
        [4186, 0.05],
      ]) {
        const o = ac.createOscillator()
        o.frequency.value = f
        const g = ac.createGain()
        g.gain.setValueAtTime(0, t + 0.05)
        g.gain.linearRampToValueAtTime(a, t + 0.055)
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.3)
        o.connect(g)
        g.connect(this.sfx)
        o.start(t + 0.05)
        o.stop(t + 1.35)
      }
      return
    }
    const space = kind === 'space'
    // a tipo batendo no rolo: estalo seco + batida de madeira
    this.burst(t, 'bandpass', space ? 1500 : rnd(2600, 3600), 1.2, space ? 0.16 : rnd(0.22, 0.3), space ? 0.05 : 0.035)
    this.thunk(t, space ? 110 : rnd(150, 190), space ? 0.25 : 0.18, 0.05)
    // mola voltando
    this.burst(t + rnd(0.04, 0.06), 'highpass', 5000, 0.7, 0.04, 0.02)
    if (kind === 'delete') this.burst(t + 0.03, 'bandpass', 1800, 2, 0.1, 0.03)
  }

  private pencil(kind: 'char' | 'space' | 'enter' | 'delete', t: number) {
    // grafite raspando o papel: ruído agudo com um pouco de aspereza
    const len = kind === 'enter' ? 0.32 : kind === 'space' ? 0.04 : rnd(0.06, 0.13)
    const gain = kind === 'space' ? 0.12 : kind === 'delete' ? 0.2 : rnd(0.2, 0.3)
    this.burst(t, 'bandpass', rnd(2400, 3800), 1.1, gain, len)
    this.burst(t + len * 0.3, 'bandpass', rnd(1300, 2000), 1.6, gain * 0.6, len * 0.7)
    if (kind === 'delete') this.burst(t, 'lowpass', 900, 0.7, 0.05, 0.12) // borracha
  }
}

export const sound = new SoundEngine()
