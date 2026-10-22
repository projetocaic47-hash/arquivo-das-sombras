import type { SupabaseClient } from '@supabase/supabase-js'
import type { CloudConfig, CloudStory, Remote } from './sync'

// A nuvem do app publicado (Vercel, GitHub Pages, qualquer endereço): Supabase, um banco
// PostgreSQL na nuvem. Cada conta entra com o próprio e-mail (link de acesso enviado pelo
// Supabase) e só ela lê e grava o seu acervo (Row Level Security no banco; ver
// supabase/migrations). A mesma conta em vários aparelhos = o mesmo acervo.
//
//   historias  uma linha por história (o JSON dela, as versões, a revisão)
//   ajustes    uma linha por conta
//
// No código vão só o endereço do projeto e a chave pública (anon), que sozinha não lê
// nada: sem login, o banco recusa tudo. A chave secreta (service_role) nunca entra aqui.
// O Supabase só é carregado (import dinâmico) quando há endereço configurado.

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Imitação usada pelos testes de navegador (só com ?debug). */
const fake = () =>
  typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')
    ? ((window as unknown as { __supabaseFake?: SupabaseClient }).__supabaseFake ?? null)
    : null

/** No link do claude.ai a nuvem é a do próprio link, mesmo com o Supabase no build. */
const inClaude = () => typeof window !== 'undefined' && !!(window as unknown as { claude?: { use?: unknown } }).claude?.use

export const supabaseAvailable = () => !!fake() || (!!(URL && KEY) && !inClaude())

let clientP: Promise<SupabaseClient | null> | null = null
export function getClient(): Promise<SupabaseClient | null> {
  clientP ??= (async () => {
    const f = fake()
    if (f) return f
    if (!URL || !KEY) return null
    try {
      const { createClient } = await import('@supabase/supabase-js')
      // a sessão fica guardada neste navegador e é renovada sozinha
      return createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } })
    } catch {
      return null
    }
  })()
  return clientP
}

export interface Account {
  id: string
  email: string
}

/** Acompanha quem está conectado neste navegador (null = ninguém). */
export function watchAccount(cb: (a: Account | null) => void): () => void {
  let stop = () => {}
  let dead = false
  let last = ''
  const emit = (a: Account | null) => {
    const k = a ? a.id : ''
    if (k === last) return
    last = k
    cb(a)
  }
  void getClient().then(async (c) => {
    if (!c || dead) return
    const { data } = c.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      emit(u ? { id: u.id, email: u.email || '' } : null)
    })
    stop = () => data.subscription.unsubscribe()
    const { data: s } = await c.auth.getSession()
    const u = s.session?.user
    if (!dead) emit(u ? { id: u.id, email: u.email || '' } : null)
  })
  return () => {
    dead = true
    stop()
  }
}

/** Envia o link de acesso para o e-mail. */
export async function sendLoginLink(email: string) {
  const c = await getClient()
  if (!c) throw new Error('a nuvem não está configurada neste endereço')
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })
  if (error) throw new Error(error.message)
}

/** Entra com o código de 6 dígitos do e-mail (útil no celular, sem trocar de navegador). */
export async function verifyLoginCode(email: string, token: string) {
  const c = await getClient()
  if (!c) throw new Error('a nuvem não está configurada neste endereço')
  const { error } = await c.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  const c = await getClient()
  await c?.auth.signOut()
}

/** Sem resposta em 20 s, a chamada conta como falha (sem internet) e fica para depois. */
function timeout<T>(p: PromiseLike<T>, ms = 20_000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('a nuvem não respondeu')), ms)
    Promise.resolve(p).then(
      (v) => (clearTimeout(t), res(v)),
      (e) => (clearTimeout(t), rej(e)),
    )
  })
}

type Row = { id: string; story: CloudStory['story']; v: CloudStory['v'] | null; rev: number; dev: string; at: number; gone: boolean }
const COLS = 'id,story,v,rev,dev,at,gone'

function toStory(r: Row): CloudStory {
  const c: CloudStory = { id: r.id, story: r.story ?? null, rev: r.rev, dev: r.dev, at: Number(r.at) }
  if (r.v) c.v = r.v
  if (r.gone) c.gone = true
  return c
}

/** Erro do banco como Error comum; a revisão recusada leva o código 'conflict'. */
function fail(e: { message: string; code?: string }): Error {
  return Object.assign(new Error(e.message), { code: e.code === 'P0409' ? 'conflict' : e.code })
}

/**
 * Lista + mudanças em tempo real + nova leitura ao voltar para a página, ao reconectar e a
 * cada minuto (se o tempo real cair, nada fica para trás).
 */
function watch<T>(client: SupabaseClient, table: string, uid: string, read: () => Promise<T>, onRow: (row: Record<string, unknown>) => void, next: (v: T) => void, failed: (e: unknown) => void) {
  let dead = false
  let reading = false
  let again = false
  const refresh = async () => {
    if (dead) return
    if (reading) {
      again = true
      return
    }
    reading = true
    try {
      const v = await timeout(read())
      if (!dead) next(v)
    } catch (e) {
      if (!dead) failed(e)
    } finally {
      reading = false
      if (again && !dead) {
        again = false
        void refresh()
      }
    }
  }
  const ch = client
    .channel(`${table}-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `owner=eq.${uid}` }, (p: { new?: Record<string, unknown> }) => {
      // exclusão de linha não acontece (excluir de vez vira lápide): só entradas e alterações
      if (!dead && p.new && Object.keys(p.new).length) onRow(p.new)
    })
    .subscribe((s: string) => {
      // conectou (ou reconectou): lê tudo de novo, para não perder o que mudou no meio
      if (s === 'SUBSCRIBED') void refresh()
    })
  const visible = () => document.visibilityState === 'visible' && void refresh()
  document.addEventListener('visibilitychange', visible)
  addEventListener('focus', visible)
  addEventListener('online', visible)
  const tick = setInterval(visible, 60_000)
  void refresh()
  return () => {
    dead = true
    document.removeEventListener('visibilitychange', visible)
    removeEventListener('focus', visible)
    removeEventListener('online', visible)
    clearInterval(tick)
    void client.removeChannel(ch)
  }
}

/** O acervo desta conta no Supabase, no formato que o motor de sincronização usa. */
export function supabaseRemote(client: SupabaseClient, uid: string): Remote {
  const readAll = async () => {
    const out: CloudStory[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from('historias').select(COLS).order('id').range(from, from + 499)
      if (error) throw fail(error)
      out.push(...(data as Row[]).map(toStory))
      if ((data as Row[]).length < 500) return out
    }
  }
  const readCfg = async (): Promise<CloudConfig | null> => {
    const { data, error } = await client.from('ajustes').select('cfg,at,dev').maybeSingle()
    if (error) throw fail(error)
    const d = data as { cfg: CloudConfig['cfg']; at: number; dev: string } | null
    return d && d.cfg ? { cfg: d.cfg, at: Number(d.at), dev: d.dev } : null
  }
  return {
    // a revisão é conferida no próprio banco (put_historia): não precisa de trava
    lock: async () => true,
    getStory: async (id) => {
      const { data, error } = await timeout(client.from('historias').select(COLS).eq('id', id).maybeSingle())
      if (error) throw fail(error)
      return data ? toStory(data as Row) : null
    },
    putStory: async (c) => {
      const { error } = await timeout(
        client.rpc('put_historia', { p_id: c.id, p_story: c.story, p_v: c.v ?? null, p_rev: c.rev, p_dev: c.dev, p_at: c.at, p_gone: !!c.gone }),
      )
      if (error) throw fail(error)
    },
    watchStories: (next, failed) => watch(client, 'historias', uid, readAll, (r) => next([toStory(r as unknown as Row)]), next, failed),
    putConfig: async (c) => {
      const { error } = await timeout(client.from('ajustes').upsert({ owner: uid, cfg: c.cfg, at: c.at, dev: c.dev }, { onConflict: 'owner' }))
      if (error) throw fail(error)
    },
    watchConfig: (next, failed) =>
      watch(client, 'ajustes', uid, readCfg, (r) => r.cfg && next({ cfg: r.cfg as CloudConfig['cfg'], at: Number(r.at), dev: String(r.dev) }), next, failed),
  }
}
