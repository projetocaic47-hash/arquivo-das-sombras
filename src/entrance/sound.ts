// Efeitos sonoros da porta de entrada, em arquivos de public/sons/. O áudio só começa
// depois de um clique (política dos navegadores). Arquivo ausente ou com defeito: o som
// simplesmente não toca, e o puzzle segue igual. Cada efeito toca uma voz por vez.

export type SoundName = 'knock' | 'ignite' | 'creak' | 'hinges'

const FILES: Record<SoundName, string[]> = {
  knock: ['porta-batida-1', 'porta-batida-2', 'porta-batida-3'],
  ignite: ['vela-acender'],
  creak: ['madeira-rangendo'],
  hinges: ['porta-dobradicas'],
}
const VOLUME: Record<SoundName, number> = { knock: 0.7, ignite: 0.45, creak: 0.55, hinges: 0.6 }
const dir = `${import.meta.env.BASE_URL}sons/`

let ctx: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()
const playing = new Map<SoundName, AudioBufferSourceNode>()

/** Arquivos que existem de fato, listados em public/sons/lista.json (ex.: "porta-batida-1.mp3"). */
let available: Promise<string[]> | null = null
const list = () =>
  (available ??= fetch(dir + 'lista.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((a) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []))
    .catch(() => []))

async function load(base: string): Promise<AudioBuffer | null> {
  try {
    const file = (await list()).find((f) => f.replace(/\.[a-z0-9]+$/i, '') === base)
    if (!file) return null
    const r = await fetch(dir + file)
    if (!r.ok) return null
    return await ctx!.decodeAudioData(await r.arrayBuffer())
  } catch {
    return null
  }
}

/** Chamado no primeiro clique: cria o áudio e começa a carregar os arquivos. */
export function unlockSound() {
  if (ctx) return
  try {
    ctx = new AudioContext()
  } catch {
    return
  }
  for (const list of Object.values(FILES)) for (const f of list) if (!buffers.has(f)) buffers.set(f, load(f))
}

/** Toca um efeito; a variação é sorteada. Nunca lança erro. */
export async function play(name: SoundName) {
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') await ctx.resume()
    const list = FILES[name]
    const buf = await buffers.get(list[Math.floor(Math.random() * list.length)])
    if (!buf) return
    playing.get(name)?.stop()
    const src = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = VOLUME[name]
    src.buffer = buf
    src.connect(gain).connect(ctx.destination)
    src.onended = () => playing.get(name) === src && playing.delete(name)
    playing.set(name, src)
    src.start()
  } catch {
    // sem som: segue em silêncio
  }
}

/** Para todos os efeitos (ao sair da porta). */
export function stopAll() {
  playing.forEach((s) => {
    try {
      s.stop()
    } catch {
      // já parado
    }
  })
  playing.clear()
}
