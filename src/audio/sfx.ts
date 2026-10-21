// Motor central dos efeitos sonoros. Um único AudioContext, criado no primeiro gesto da
// pessoa (os navegadores bloqueiam áudio antes disso). Todo som passa pelo mesmo caminho:
//
//   voz → [seco + um pouco de sala] → volume geral → limitador → alto-falante
//
// O limitador evita distorção quando vários sons coincidem. Cada nome de som tem no máximo
// duas vozes ao mesmo tempo e ignora repetições a menos de 40 ms (cliques duplicados).
// Preferências (ligado/desligado e volume) ficam no localStorage, fora do IndexedDB.
// Nada aqui lança erro: sem áudio, o app segue igual, em silêncio.

import { RECIPES, type SoundName, type Voice } from './synth'

export type { SoundName }

export interface SoundPrefs {
  on: boolean
  /** 0 a 1 */
  vol: number
}

const KEY = 'arquivo-som'
const MAX_GAIN = 0.8
const GAP_MS = 40
const MAX_VOICES = 2

/**
 * Acerto de nível por som, medido nas gravações offline (os sons com ressonância estreita,
 * como os toques de madeira, saem naturalmente muito mais baixos que os de papel).
 * Referência: a página virando, o som mais frequente.
 */
const TRIM: Partial<Record<SoundName, number>> = {
  'ui.tick': 5,
  'dialog.open': 12,
  'dialog.cancel': 25,
  'box.close': 11,
  'ui.error': 7,
  'quill.dip': 3,
  'door.poster': 3.5,
  'box.open': 2.5,
  'door.hinges': 2.5,
  'panel.close': 2,
  'page.land': 2,
  'page.lift': 1.2,
  'door.knock': 2,
}

/**
 * Arquivos de som opcionais em public/sons/ (listados em lista.json) substituem o som
 * sintetizado do mesmo nome. Sem arquivo, vale a síntese.
 */
const FILES: Partial<Record<SoundName, string[]>> = {
  'door.knock': ['porta-batida-1', 'porta-batida-2', 'porta-batida-3'],
  'door.ignite': ['vela-acender'],
  'door.poster': ['madeira-rangendo'],
  'door.hinges': ['porta-dobradicas'],
}

function readPrefs(): SoundPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (p && typeof p.on === 'boolean' && typeof p.vol === 'number') return { on: p.on, vol: Math.min(1, Math.max(0, p.vol)) }
  } catch {
    // sem localStorage: usa o padrão
  }
  return { on: true, vol: 0.7 }
}

let prefs = readPrefs()
let reduced = false
const subs = new Set<(p: SoundPrefs) => void>()

let ctx: AudioContext | null = null
let master: GainNode | null = null
let dry: GainNode | null = null
let room: GainNode | null = null
let broken = false

interface Live {
  name: SoundName
  gain: GainNode
  end: number
}
const live: Live[] = []
const lastAt = new Map<SoundName, number>()

/** Registro para os testes (só com ?debug). */
const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')
const log: { name: SoundName; at: number; muted: boolean }[] = []

// ---------------------------------------------------------------- arquivos opcionais

const dir = `${import.meta.env.BASE_URL}sons/`
let listing: Promise<string[]> | null = null
const fileBuffers = new Map<string, Promise<AudioBuffer | null>>()

const list = () =>
  (listing ??= fetch(dir + 'lista.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((a) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []))
    .catch(() => []))

async function loadFile(base: string): Promise<AudioBuffer | null> {
  try {
    const file = (await list()).find((f) => f.replace(/\.[a-z0-9]+$/i, '') === base)
    if (!file || !ctx) return null
    const r = await fetch(dir + file)
    if (!r.ok) return null
    return await ctx.decodeAudioData(await r.arrayBuffer())
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- contexto

/** Resposta curta e escura de uma sala de pedra e madeira, gerada na hora. */
function impulse(c: BaseAudioContext) {
  const sr = c.sampleRate
  const n = Math.round(sr * 0.9)
  const buf = c.createBuffer(2, n, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < n; i++) {
      lp += 0.25 * (Math.random() * 2 - 1 - lp)
      d[i] = lp * Math.pow(1 - i / n, 3.2) * (i < sr * 0.012 ? 0 : 1)
    }
  }
  return buf
}

function setup(): boolean {
  if (ctx) return true
  if (broken) return false
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) throw new Error('sem Web Audio')
    const c = new AC()
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.knee.value = 8
    limiter.ratio.value = 6
    limiter.attack.value = 0.003
    limiter.release.value = 0.2
    master = c.createGain()
    master.gain.value = level()
    master.connect(limiter).connect(c.destination)
    dry = c.createGain()
    dry.connect(master)
    room = c.createGain()
    room.gain.value = 0.16
    const verb = c.createConvolver()
    verb.buffer = impulse(c)
    const tone = c.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2600
    room.connect(verb).connect(tone).connect(master)
    ctx = c
    for (const names of Object.values(FILES)) for (const f of names || []) if (!fileBuffers.has(f)) fileBuffers.set(f, loadFile(f))
    return true
  } catch {
    broken = true
    ctx = null
    return false
  }
}

const level = () => (prefs.on ? Math.max(0.0001, prefs.vol * MAX_GAIN) : 0.0001)

/**
 * Destrava o áudio no primeiro gesto (clique, toque ou tecla). No iOS o contexto só começa
 * de verdade depois de tocar algo dentro do gesto, então sai um buffer silencioso.
 */
function unlock() {
  if (!setup() || !ctx) return
  try {
    if (ctx.state !== 'running') void ctx.resume().catch(() => {})
    const b = ctx.createBuffer(1, 1, ctx.sampleRate)
    const s = ctx.createBufferSource()
    s.buffer = b
    s.connect(ctx.destination)
    s.start()
  } catch {
    // segue em silêncio
  }
}

let installed = false
/** Liga a destrava uma única vez (chamado ao iniciar o app). */
export function installSound() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const opts = { capture: true, passive: true } as const
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, opts)
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    reduced ||= mq.matches
  } catch {
    // sem matchMedia
  }
  if (debug) (window as unknown as { __sfx: unknown }).__sfx = { log, prefs: () => prefs, state: () => ctx?.state ?? (broken ? 'broken' : 'none'), live: () => live.length, render, names: Object.keys(RECIPES) }
}

/** "Reduzir animações" do app (ou do sistema): sons longos ficam mais curtos. */
export function setReducedSound(r: boolean) {
  let sys = false
  try {
    sys = matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // sem matchMedia
  }
  reduced = r || sys
}

// ---------------------------------------------------------------- preferências

export const getSoundPrefs = () => prefs

export function setSoundPrefs(p: Partial<SoundPrefs>) {
  prefs = { on: p.on ?? prefs.on, vol: Math.min(1, Math.max(0, p.vol ?? prefs.vol)) }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // não persistiu; vale para esta sessão
  }
  if (ctx && master) {
    const t = ctx.currentTime
    master.gain.cancelScheduledValues(t)
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t)
    master.gain.exponentialRampToValueAtTime(level(), t + 0.06)
  }
  if (!prefs.on) stopSounds()
  subs.forEach((f) => f(prefs))
}

export function onSoundPrefs(f: (p: SoundPrefs) => void) {
  subs.add(f)
  return () => void subs.delete(f)
}

// ---------------------------------------------------------------- tocar

function fadeOut(v: Live, sec = 0.08) {
  if (!ctx) return
  try {
    const t = ctx.currentTime
    v.gain.gain.cancelScheduledValues(t)
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t)
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + sec)
    v.end = t + sec
    setTimeout(() => {
      try {
        v.gain.disconnect()
      } catch {
        // já desligado
      }
    }, sec * 1000 + 60)
  } catch {
    // ignora
  }
}

function prune() {
  const t = ctx ? ctx.currentTime : 0
  for (let i = live.length - 1; i >= 0; i--) if (live[i].end < t) live.splice(i, 1)
}

/** Toca um efeito pelo nome. Nunca lança erro; sem áudio ou com som desligado, não faz nada. */
export function sfx(name: SoundName, opts?: Record<string, unknown>) {
  const now = performance.now()
  const last = lastAt.get(name)
  if (last !== undefined && now - last < GAP_MS) return
  lastAt.set(name, now)
  if (debug) log.push({ name, at: Math.round(now), muted: !prefs.on })
  if (!prefs.on) return
  if (!ctx && !setup()) return
  const c = ctx!
  try {
    if (c.state === 'suspended') void c.resume().catch(() => {})
    prune()
    const same = live.filter((v) => v.name === name)
    while (same.length >= MAX_VOICES) fadeOut(same.shift()!, 0.06)
    const gain = c.createGain()
    gain.gain.value = TRIM[name] ?? 1
    gain.connect(dry!)
    gain.connect(room!)
    const t = c.currentTime + 0.005
    const entry: Live = { name, gain, end: t + 1 }
    live.push(entry)
    const finish = (dur: number) => {
      entry.end = t + dur + 0.6
      setTimeout(() => {
        const i = live.indexOf(entry)
        if (i >= 0) live.splice(i, 1)
        try {
          gain.disconnect()
        } catch {
          // já desligado
        }
      }, (dur + 1.2) * 1000)
    }
    // uma receita pode receber o "reduzir" já decidido por quem chama (a porta usa só o do sistema)
    const red = opts && typeof opts.reduced === 'boolean' ? opts.reduced : reduced
    const files = FILES[name]
    if (files) {
      const base = files[Math.floor(Math.random() * files.length)]
      void (fileBuffers.get(base) ?? Promise.resolve(null)).then((buf) => {
        try {
          if (buf) {
            // arquivo gravado: toca no nível em que foi mixado
            gain.gain.value = 1
            const s = c.createBufferSource()
            s.buffer = buf
            s.connect(gain)
            s.start()
            finish(buf.duration)
          } else finish(RECIPES[name]({ ctx: c, out: gain, t: c.currentTime + 0.005, reduced: red }, opts))
        } catch {
          finish(0)
        }
      })
      return
    }
    finish(RECIPES[name]({ ctx: c, out: gain, t, reduced: red }, opts))
  } catch {
    // segue em silêncio
  }
}

/** Para tudo com um fade curto (nunca um corte seco). */
export function stopSounds(name?: SoundName, sec = 0.25) {
  for (const v of live.slice()) if (!name || v.name === name) fadeOut(v, sec)
}

// ---------------------------------------------------------------- análise (testes)

/**
 * Grava offline, pelo mesmo caminho do som ao vivo (volume máximo, sala e limitador), e
 * mede pico, RMS e duração. Vários nomes de uma vez tocam juntos (teste de saturação).
 * Com `pcm`, devolve também o áudio em WAV base64 (para a página de prévia).
 */
async function render(names: SoundName | SoundName[], opts?: Record<string, unknown>, red = false, pcm = false) {
  const list = Array.isArray(names) ? names : [names]
  const sr = 44100
  const oc = new OfflineAudioContext(1, sr * 6, sr)
  const limiter = oc.createDynamicsCompressor()
  limiter.threshold.value = -14
  limiter.knee.value = 8
  limiter.ratio.value = 6
  limiter.attack.value = 0.003
  limiter.release.value = 0.2
  const m = oc.createGain()
  m.gain.value = MAX_GAIN
  m.connect(limiter).connect(oc.destination)
  const r = oc.createGain()
  r.gain.value = 0.16
  const verb = oc.createConvolver()
  verb.buffer = impulse(oc)
  const tone = oc.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  r.connect(verb).connect(tone).connect(m)
  let dur = 0
  for (const name of list) {
    const out = oc.createGain()
    out.gain.value = TRIM[name] ?? 1
    out.connect(m)
    out.connect(r)
    dur = Math.max(dur, RECIPES[name]({ ctx: oc, out, t: 0.01, reduced: red } satisfies Voice, opts))
  }
  const buf = await oc.startRendering()
  const d = buf.getChannelData(0)
  let peak = 0
  let sum = 0
  let lastLoud = 0
  let nan = false
  for (let i = 0; i < d.length; i++) {
    if (!Number.isFinite(d[i])) nan = true
    peak = Math.max(peak, Math.abs(d[i]))
  }
  // fim audível: último ponto acima de −50 dB do pico
  for (let i = 0; i < d.length; i++) {
    sum += d[i] * d[i]
    if (Math.abs(d[i]) > peak * 0.003) lastLoud = i
  }
  // o fim tem que chegar baixinho (sem corte seco): pico dos últimos 20 ms audíveis
  let tailPeak = 0
  for (let i = Math.max(0, lastLoud - Math.round(sr * 0.02)); i <= lastLoud; i++) tailPeak = Math.max(tailPeak, Math.abs(d[i]))
  let wav = ''
  if (pcm) {
    const n = lastLoud + Math.round(sr * 0.05)
    const bytes = new Uint8Array(44 + n * 2)
    const v = new DataView(bytes.buffer)
    const str = (o: number, t: string) => [...t].forEach((ch, k) => v.setUint8(o + k, ch.charCodeAt(0)))
    str(0, 'RIFF')
    v.setUint32(4, 36 + n * 2, true)
    str(8, 'WAVEfmt ')
    v.setUint32(16, 16, true)
    v.setUint16(20, 1, true)
    v.setUint16(22, 1, true)
    v.setUint32(24, sr, true)
    v.setUint32(28, sr * 2, true)
    v.setUint16(32, 2, true)
    v.setUint16(34, 16, true)
    str(36, 'data')
    v.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] || 0)) * 32767, true)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    wav = btoa(bin)
  }
  return { names: list, dur, peak, rms: Math.sqrt(sum / Math.max(1, lastLoud)), audible: lastLoud / sr, tailPeak, nan, wav }
}

