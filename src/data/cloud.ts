import type { CloudConfig, CloudStory, Remote } from './sync'

// A nuvem do app: o banco de dados do link publicado no claude.ai (capacidade `db`).
// Cada pessoa tem uma área própria e privada, data/users/<id da pessoa>/, que só ela lê e
// grava, de qualquer aparelho em que entre com a mesma conta. Fora do claude.ai (o app
// aberto pelo arquivo ou pelo servidor local) não há nuvem: o app segue só com o IndexedDB.
//
//   data/users/<id>/ajustes                    os ajustes
//   data/users/<id>/arquivo/historias/<chave>  uma história por documento
//   data/users/<id>/arquivo/travas/<chave>     trava curta usada ao enviar uma história

type Snap = { exists: boolean; data(): Record<string, unknown> | undefined; metadata?: { fromCache: boolean } }
type DocRef = {
  get(): Promise<Snap>
  set(d: Record<string, unknown>): Promise<void>
  acquire(o: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean }>
  onSnapshot(next: (s: Snap) => void, err?: (e: { code: string }) => void): () => void
  collection(p: string): ColRef
}
type ColRef = {
  doc(id: string): DocRef
  onSnapshot(next: (s: { docs: Snap[]; metadata?: { fromCache: boolean } }) => void, err?: (e: { code: string }) => void): () => void
}
type Db = { doc(p: string): DocRef }
type ClaudeRuntime = { use(name: string): Promise<unknown> }

/** Sem resposta em 20 s, a chamada conta como falha (sem internet) e fica para depois. */
function timeout<T>(p: Promise<T>, ms = 20_000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('a nuvem não respondeu')), ms)
    p.then(
      (v) => (clearTimeout(t), res(v)),
      (e) => (clearTimeout(t), rej(e)),
    )
  })
}

/** Nome de documento aceito pelo banco (letras, números e _ - . ~ : @ +). */
export function docKey(id: string) {
  return /^[A-Za-z0-9_\-~:@+][A-Za-z0-9_\-.~:@+]{0,150}$/.test(id) ? id : 'h' + [...new TextEncoder().encode(id)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 190)
}

const isStory = (d: Record<string, unknown> | undefined): d is Record<string, unknown> & CloudStory => !!d && typeof d.id === 'string' && typeof d.rev === 'number'

/**
 * Inscrição que se refaz sozinha se o canal cair (o banco só entrega um erro final por
 * inscrição). Acesso retirado ou chamada inválida: para de vez.
 */
function resubscribing<S>(open: (next: (s: S) => void, err: (e: { code: string }) => void) => () => void, next: (s: S) => void, fail: (e: unknown) => void) {
  let stop: (() => void) | null = null
  let timer = 0
  let dead = false
  const go = () => {
    stop = open(next, (e) => {
      fail(e)
      if (dead || e.code === 'revoked' || e.code === 'invalid_argument' || e.code === 'not_granted') return
      timer = window.setTimeout(go, 5000 + Math.random() * 5000)
    })
  }
  go()
  return () => {
    dead = true
    clearTimeout(timer)
    stop?.()
  }
}

/** A nuvem desta pessoa, ou null quando o app não está aberto pelo link do claude.ai (ou sem login). */
export async function connectCloud(): Promise<{ remote: Remote; user: string } | null> {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude
  if (!claude?.use) return null
  try {
    const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, { id(): Promise<string | null> } | null]
    const uid = db && user ? await user.id() : null
    if (!db || !uid) return null
    const base = `data/users/${uid}`
    const shelf = db.doc(`${base}/arquivo`)
    const stories = shelf.collection('historias')
    const locks = shelf.collection('travas')
    const cfg = db.doc(`${base}/ajustes`)
    const holder = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    const remote: Remote = {
      lock: async (id) => (await timeout(locks.doc(docKey(id)).acquire({ holder, ttlMs: 15_000 }))).acquired,
      getStory: async (id) => {
        const s = await timeout(stories.doc(docKey(id)).get())
        const d = s.exists ? s.data() : undefined
        return isStory(d) ? (structuredClone(d) as CloudStory) : null
      },
      putStory: (c) => timeout(stories.doc(docKey(c.id)).set(JSON.parse(JSON.stringify(c)))),
      watchStories: (next, fail) =>
        resubscribing<{ docs: Snap[]; metadata?: { fromCache: boolean } }>(
          (n, e) => stories.onSnapshot(n, e),
          (snap) => (snap.metadata?.fromCache && !snap.docs.length) || next(snap.docs.map((d) => d.data()).filter(isStory).map((d) => structuredClone(d) as CloudStory)),
          fail,
        ),
      putConfig: (c) => timeout(cfg.set(JSON.parse(JSON.stringify(c)))),
      watchConfig: (next, fail) =>
        resubscribing<Snap>(
          (n, e) => cfg.onSnapshot(n, e),
          (s) => {
            // "ainda não existe" vindo do cache não é resposta da nuvem: espera a de verdade,
            // para um aparelho novo não mandar os ajustes dele por cima dos que já estão lá
            if (!s.exists && s.metadata?.fromCache) return
            const d = s.exists ? s.data() : undefined
            next(d && typeof d.at === 'number' && d.cfg ? (structuredClone(d) as unknown as CloudConfig) : null)
          },
          fail,
        ),
    }
    return { remote, user: uid }
  } catch {
    return null
  }
}
