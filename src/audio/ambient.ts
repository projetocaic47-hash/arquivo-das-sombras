// Chuva e trovões de fundo: uma única camada contínua, sob o volume geral do app.
//
//   chuva (buffer em loop, emenda com crossfade) ─┐
//                                                 ├─ ambiente (volume da chuva) → volume geral
//   trovões (arquivo em streaming, em loop)  ─────┘
//
// - Só começa depois do primeiro gesto (regra dos navegadores) e só carrega os arquivos
//   nesse momento: a abertura do app não espera pelo áudio.
// - A chuva (42 s) é decodificada uma vez; o fim e o começo são fundidos num crossfade de
//   igual potência, então o loop não tem silêncio nem estalo (o MP3 traz alguns ms de
//   silêncio nas pontas, que são cortados antes).
// - Os trovões (2 min 37 s) tocam em streaming por um elemento de áudio, sem decodificar o
//   arquivo inteiro na memória (seriam ~55 MB). O arquivo começa e termina quase em silêncio,
//   então a volta do loop não se percebe; as pausas entre trovões são da própria gravação.
// - Aba escondida ou janela minimizada: tudo some num fade e o áudio é suspenso (sem gastar
//   CPU); ao voltar, retoma de onde estava, com fade.
// - Desligar a chuva nos Ajustes (ou todo o som) para os arquivos e libera a memória.
// Nada aqui lança erro: sem áudio, o app segue igual.

import { getAudio, getSoundPrefs, onAudioUnlock, onSoundPrefs } from './sfx'

const dir = `${import.meta.env.BASE_URL}sons/`
/** níveis de cada camada com o volume da chuva em 100% (antes do volume geral) */
export const RAIN_LEVEL = 0.25
export const THUNDER_LEVEL = 0.14
const FADE_IN = 3
const FADE_OUT = 0.8
const XFADE = 1.5

let bus: GainNode | null = null
let rain: AudioBufferSourceNode | null = null
let rainBuffer: Promise<AudioBuffer | null> | null = null
let thunder: HTMLAudioElement | null = null
let thunderNode: MediaElementAudioSourceNode | null = null
/** a ambientação deveria estar tocando (ligada, destravada e com a aba à vista) */
let active = false
let starts = 0
let stopTimer = 0

const want = () => {
  const p = getSoundPrefs()
  return p.on && p.amb && document.visibilityState !== 'hidden'
}
const level = () => Math.max(0.0001, getSoundPrefs().ambVol)

function ramp(to: number, sec: number) {
  const a = getAudio()
  if (!a || !bus) return
  const t = a.ctx.currentTime
  bus.gain.cancelScheduledValues(t)
  bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t)
  bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + sec)
}

/** Funde o fim no começo: o buffer resultante faz loop sem emenda audível. */
export function seamless(ctx: BaseAudioContext, src: AudioBuffer, xfade = XFADE): AudioBuffer {
  const sr = src.sampleRate
  const chans = Array.from({ length: src.numberOfChannels }, (_, c) => src.getChannelData(c))
  // corta o silêncio de codificação nas pontas
  const loud = (i: number) => chans.some((d) => Math.abs(d[i]) > 1e-4)
  let a = 0
  let b = src.length
  while (a < b && !loud(a)) a++
  while (b > a && !loud(b - 1)) b--
  const n = b - a
  const x = Math.min(Math.round(xfade * sr), Math.floor(n / 4))
  const out = ctx.createBuffer(src.numberOfChannels, n - x, sr)
  for (let c = 0; c < chans.length; c++) {
    const d = chans[c]
    const o = out.getChannelData(c)
    o.set(d.subarray(a + x, b - x), x)
    for (let i = 0; i < x; i++) {
      const k = (i / x) * (Math.PI / 2)
      // igual potência: o começo entra enquanto o fim sai
      o[i] = d[a + i] * Math.sin(k) + d[b - x + i] * Math.cos(k)
    }
  }
  return out
}

async function loadRain(ctx: AudioContext) {
  try {
    const r = await fetch(dir + 'chuva.mp3')
    if (!r.ok) return null
    return seamless(ctx, await ctx.decodeAudioData(await r.arrayBuffer()))
  } catch {
    return null
  }
}

/** Liga a camada (idempotente: chamar de novo não cria uma segunda chuva). */
function start() {
  const a = getAudio()
  if (!a || !want()) return
  clearTimeout(stopTimer)
  const { ctx, master } = a
  try {
    if (!bus) {
      bus = ctx.createGain()
      bus.gain.value = 0.0001
      bus.connect(master)
    }
    if (!thunder) {
      thunder = new Audio(dir + 'trovoes.mp3')
      thunder.loop = true
      thunder.preload = 'auto'
      thunderNode = ctx.createMediaElementSource(thunder)
      const g = ctx.createGain()
      g.gain.value = THUNDER_LEVEL
      thunderNode.connect(g).connect(bus)
    }
    // play() precisa acontecer dentro do gesto em celulares: por isso start() roda no unlock
    if (thunder.paused) void thunder.play().catch(() => {})
    if (!rain) {
      rainBuffer ??= loadRain(ctx)
      const mine = rainBuffer
      void mine.then((buf) => {
        if (!buf || rain || !active || mine !== rainBuffer) return
        const s = ctx.createBufferSource()
        s.buffer = buf
        s.loop = true
        const g = ctx.createGain()
        g.gain.value = RAIN_LEVEL
        s.connect(g).connect(bus!)
        s.start()
        rain = s
        starts++
      })
    }
    if (!active) {
      active = true
      ramp(level(), FADE_IN)
    }
  } catch {
    // segue em silêncio
  }
}

/** Some num fade. `release`: também para os arquivos e solta a memória (chuva desligada). */
function stop(release: boolean) {
  if (!active && !release) return
  active = false
  ramp(0.0001, FADE_OUT)
  clearTimeout(stopTimer)
  stopTimer = window.setTimeout(() => {
    if (active) return
    thunder?.pause()
    if (!release) return
    try {
      rain?.stop()
    } catch {
      // já parada
    }
    rain?.disconnect()
    rain = null
    rainBuffer = null
    if (thunder) {
      thunderNode?.disconnect()
      thunder.removeAttribute('src')
      thunder.load()
    }
    thunder = null
    thunderNode = null
  }, FADE_OUT * 1000 + 100)
}

function apply() {
  const p = getSoundPrefs()
  if (!getAudio()) return
  if (!p.on || !p.amb) return stop(true)
  if (document.visibilityState === 'hidden') return stop(false)
  if (active) ramp(level(), 0.15)
  else start()
}

let installed = false
/** Liga a ambientação ao motor de som (uma vez só, no início do app). */
export function installAmbient() {
  if (installed || typeof window === 'undefined') return
  installed = true
  onAudioUnlock(() => {
    // dentro do gesto: começa (ou retoma depois de o celular ter suspendido o áudio)
    if (want() && !active) start()
    else if (active && thunder?.paused) void thunder.play().catch(() => {})
  })
  onSoundPrefs(apply)
  document.addEventListener('visibilitychange', () => {
    const a = getAudio()
    if (!a) return
    if (document.visibilityState === 'hidden') {
      stop(false)
      // depois do fade, o áudio inteiro dorme (efeitos incluídos): nada processa com a aba escondida
      setTimeout(() => document.visibilityState === 'hidden' && void a.ctx.suspend().catch(() => {}), FADE_OUT * 1000 + 150)
    } else {
      void a.ctx.resume().catch(() => {})
      apply()
    }
  })
  if (new URLSearchParams(location.search).has('debug'))
    (window as unknown as { __amb: unknown }).__amb = {
      state: () => ({
        active,
        rain: !!rain,
        rainStarts: starts,
        thunderPaused: thunder ? thunder.paused : null,
        thunderTime: thunder ? thunder.currentTime : null,
        gain: bus ? bus.gain.value : null,
        ctx: getAudio()?.ctx.state ?? null,
      }),
      seamless,
    }
}
