import type { Config, Story } from './types'

// Sincronização do acervo com a nuvem. O IndexedDB continua sendo a cópia local (o app
// abre e grava sem internet); cada mudança local fica marcada como pendente até a nuvem
// confirmar. Mudanças que chegam da nuvem entram no IndexedDB.
//
// Conflito: cada história na nuvem tem um número de revisão. O aparelho lembra a revisão
// que viu por último; se, ao enviar uma mudança, a nuvem já tiver outra revisão (outro
// aparelho mudou a mesma história nesse meio-tempo), nada é sobrescrito: a versão da
// nuvem fica na história e a deste aparelho vira uma cópia nova, "(cópia em conflito)".
// Histórias excluídas de vez viram uma lápide na nuvem, para sumirem dos outros aparelhos.
// Os ajustes (nome, frase, letra, marcadores, posição) seguem a mudança mais recente.
// Sem navegador: a nuvem e a gravação local entram como parâmetros, para ser testado.

/** Uma história como fica guardada na nuvem. */
export interface CloudStory {
  id: string
  /** a história sem as versões anteriores */
  story: Omit<Story, 'v'> | null
  /** versões anteriores, as mais recentes, enquanto couberem no documento */
  v?: Story['v']
  rev: number
  /** aparelho que gravou */
  dev: string
  at: number
  /** excluída de vez */
  gone?: boolean
}

export interface CloudConfig {
  cfg: Config
  at: number
  dev: string
}

/** O serviço de nuvem (no app: o banco do link do Claude). */
export interface Remote {
  /** Trava curta da história, para ler-comparar-gravar sem outro aparelho no meio. */
  lock(id: string): Promise<boolean>
  getStory(id: string): Promise<CloudStory | null>
  putStory(c: CloudStory): Promise<void>
  watchStories(next: (list: CloudStory[]) => void, fail: (e: unknown) => void): () => void
  putConfig(c: CloudConfig): Promise<void>
  watchConfig(next: (c: CloudConfig | null) => void, fail: (e: unknown) => void): () => void
}

/** A cópia local (IndexedDB e a tela). */
export interface Local {
  stories(): Story[]
  config(): Config
  /** grava histórias vindas da nuvem e remove as excluídas de vez */
  apply(put: Story[], removed: string[]): Promise<void>
  applyConfig(c: Config): Promise<void>
}

/** O que o aparelho lembra da sincronização (no app: localStorage; o conteúdo fica no IndexedDB). */
export interface SyncMeta {
  dev: string
  /** revisão da nuvem que cada história tinha na última sincronização */
  base: Record<string, number>
  /** histórias com mudança ainda não confirmada pela nuvem */
  dirty: string[]
  /** histórias excluídas de vez aqui, ainda não avisadas à nuvem */
  purged: string[]
  cfgDirty: boolean
  cfgAt: number
}

export type SyncState = 'off' | 'syncing' | 'saved' | 'pending'

export interface SyncStatus {
  state: SyncState
  /** mudanças esperando a nuvem */
  pending: number
  /** cópias criadas por conflito nesta visita */
  conflicts: number
  /** histórias que não cabem num documento da nuvem (ficam só neste aparelho) */
  tooBig: string[]
}

/** Limite de um documento da nuvem é 256 KiB; fica uma folga. */
export const DOC_LIMIT = 200_000

const CONTENT: (keyof Story)[] = ['t', 'sub', 'x', 'tags', 'st', 'note', 'fav', 'del', 'o']
export function sameContent(a: Partial<Story> | null | undefined, b: Partial<Story> | null | undefined) {
  if (!a || !b) return false
  return CONTENT.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}

const size = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length

/** História pronta para a nuvem: versões antigas saem até caber. Nula se nem sem versões cabe. */
export function toCloud(s: Story, rev: number, dev: string, at: number): CloudStory | null {
  const { v, ...story } = s
  const versions = [...(v || [])]
  let c: CloudStory = { id: s.id, story, v: versions, rev, dev, at }
  while (size(c) > DOC_LIMIT && versions.length) {
    versions.shift()
    c = { ...c, v: [...versions] }
  }
  return size(c) > DOC_LIMIT ? null : c
}

export function fromCloud(c: CloudStory): Story | null {
  if (!c.story || c.gone) return null
  return { ...(c.story as Story), ...(c.v?.length ? { v: c.v } : {}) }
}

export const newMeta = (dev: string): SyncMeta => ({ dev, base: {}, dirty: [], purged: [], cfgDirty: false, cfgAt: 0 })

export class SyncEngine {
  private queue: Promise<unknown> = Promise.resolve()
  private stops: (() => void)[] = []
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private busy = 0
  private conflicts = 0
  private tooBig = new Set<string>()
  private listeners = new Set<(s: SyncStatus) => void>()
  private started = false
  private cloudCfg: CloudConfig | null = null
  /** os ajustes da nuvem já chegaram uma vez (antes disso, nada de enviar os daqui por cima) */
  private cfgLoaded = false
  private now: () => number
  private newId: () => string

  constructor(
    private remote: Remote,
    private local: Local,
    public meta: SyncMeta,
    private saveMeta: (m: SyncMeta) => void,
    opts: { now?: () => number; newId?: () => string } = {},
  ) {
    this.now = opts.now ?? Date.now
    this.newId = opts.newId ?? (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
  }

  subscribe(l: (s: SyncStatus) => void) {
    this.listeners.add(l)
    l(this.status())
    return () => this.listeners.delete(l)
  }

  status(): SyncStatus {
    const pending = this.meta.dirty.length + this.meta.purged.length + (this.meta.cfgDirty ? 1 : 0)
    const state: SyncState = !this.started ? 'off' : this.busy ? 'syncing' : pending ? 'pending' : 'saved'
    return { state, pending, conflicts: this.conflicts, tooBig: [...this.tooBig] }
  }

  private emit() {
    const s = this.status()
    this.listeners.forEach((l) => l(s))
  }

  private persist() {
    this.saveMeta(this.meta)
    this.emit()
  }

  /** Tarefas em fila, uma por vez: envio, recebimento e ajustes nunca se cruzam. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(async () => {
      this.busy++
      this.emit()
      try {
        return await task()
      } finally {
        this.busy--
        this.emit()
      }
    })
    this.queue = p.catch(() => {})
    return p
  }

  start() {
    if (this.started) return
    this.started = true
    // primeira vez neste aparelho: tudo o que só existe aqui sobe para a nuvem
    const known = new Set(Object.keys(this.meta.base))
    for (const s of this.local.stories()) if (!known.has(s.id) && !this.meta.dirty.includes(s.id)) this.meta.dirty.push(s.id)
    if (!this.meta.cfgAt) this.meta.cfgDirty = true
    this.persist()
    this.stops.push(
      this.remote.watchStories(
        (list) => void this.run(() => this.incoming(list)).catch(() => {}),
        () => this.later(),
      ),
      this.remote.watchConfig(
        (c) => void this.run(() => this.incomingConfig(c)).catch(() => {}),
        () => this.later(),
      ),
    )
    void this.flush()
  }

  stop() {
    this.stops.forEach((s) => s())
    this.stops = []
    if (this.timer) clearTimeout(this.timer)
    this.started = false
    this.emit()
  }

  /** Avise depois de gravar histórias localmente. */
  changed(ids: string[]) {
    for (const id of ids) if (!this.meta.dirty.includes(id)) this.meta.dirty.push(id)
    this.persist()
    return this.flush()
  }

  /** Avise depois de excluir de vez localmente. */
  purged(ids: string[]) {
    this.meta.dirty = this.meta.dirty.filter((d) => !ids.includes(d))
    for (const id of ids) if (!this.meta.purged.includes(id)) this.meta.purged.push(id)
    this.persist()
    return this.flush()
  }

  configChanged() {
    this.meta.cfgDirty = true
    this.meta.cfgAt = this.now()
    this.persist()
    return this.flush()
  }

  /** Envia tudo o que está pendente; em falha, tenta de novo mais tarde. */
  flush(): Promise<void> {
    if (!this.started) return Promise.resolve()
    return this.run(async () => {
      try {
        for (const id of [...this.meta.purged]) await this.pushPurge(id)
        for (const id of [...this.meta.dirty]) await this.pushStory(id)
        if (this.meta.cfgDirty) await this.pushConfig()
        this.retry = 0
      } catch {
        this.later()
      }
    })
  }

  /** Nova tentativa depois de uma falha (5 s, 15 s, 30 s, depois a cada minuto). */
  private later() {
    if (this.timer || !this.started) return
    const wait = [5, 15, 30, 60][Math.min(3, this.retry++)] * 1000
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, wait)
    this.emit()
  }

  /** A conexão voltou (evento `online` do navegador). */
  online() {
    this.retry = 0
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    return this.flush()
  }

  private async withLock(id: string, fn: () => Promise<void>) {
    for (let i = 0; i < 5; i++) {
      if (await this.remote.lock(id)) return fn()
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500))
    }
    throw new Error('história ocupada por outro aparelho')
  }

  private async pushStory(id: string) {
    const local = this.local.stories().find((s) => s.id === id)
    if (!local) {
      this.meta.dirty = this.meta.dirty.filter((d) => d !== id)
      this.persist()
      return
    }
    await this.withLock(id, async () => {
      const cloud = await this.remote.getStory(id)
      const base = this.meta.base[id] ?? 0
      const cloudRev = cloud?.rev ?? 0
      if (cloud && cloudRev !== base && !sameContent(cloud.story, local) && !(cloud.gone && base === 0)) {
        // outro aparelho mudou esta história depois da última sincronização daqui
        await this.conflict(local, cloud)
      } else if (cloud && cloudRev !== base && sameContent(cloud.story, local)) {
        this.meta.base[id] = cloudRev
      } else {
        const out = toCloud(local, cloudRev + 1, this.meta.dev, this.now())
        if (!out) {
          this.tooBig.add(id)
        } else {
          await this.remote.putStory(out)
          this.meta.base[id] = out.rev
          this.tooBig.delete(id)
        }
      }
      this.meta.dirty = this.meta.dirty.filter((d) => d !== id)
      this.persist()
    })
  }

  /** Nada é sobrescrito: a nuvem fica na história, e a versão deste aparelho vira uma cópia. */
  private async conflict(local: Story, cloud: CloudStory) {
    const copyId = this.newId()
    const all = this.local.stories()
    const copy: Story = { ...local, id: copyId, t: `${local.t || 'Sem título'} (cópia em conflito)`, o: Math.max(0, ...all.map((s) => s.o)) + 1, u: this.now() }
    const theirs = fromCloud(cloud)
    await this.local.apply(theirs ? [theirs, copy] : [copy], theirs ? [] : [local.id])
    this.meta.base[local.id] = cloud.rev
    this.conflicts++
    const out = toCloud(copy, 1, this.meta.dev, this.now())
    if (out) {
      await this.remote.putStory(out)
      this.meta.base[copyId] = 1
    } else {
      this.tooBig.add(copyId)
    }
  }

  private async pushPurge(id: string) {
    await this.withLock(id, async () => {
      const cloud = await this.remote.getStory(id)
      if (cloud && !cloud.gone) {
        const base = this.meta.base[id] ?? 0
        if (cloud.rev !== base) {
          // excluída aqui, mas alterada em outro aparelho: a alteração de lá vence e volta
          const theirs = fromCloud(cloud)
          if (theirs) await this.local.apply([theirs], [])
          this.meta.base[id] = cloud.rev
        } else {
          await this.remote.putStory({ id, story: null, rev: cloud.rev + 1, dev: this.meta.dev, at: this.now(), gone: true })
          this.meta.base[id] = cloud.rev + 1
        }
      }
      this.meta.purged = this.meta.purged.filter((d) => d !== id)
      this.persist()
    })
  }

  private async pushConfig() {
    if (!this.cfgLoaded) return
    const cur = this.cloudCfg
    // a nuvem tem ajustes mais novos que a mudança daqui: ficam os de lá
    if (cur && cur.at > this.meta.cfgAt && cur.dev !== this.meta.dev) {
      await this.local.applyConfig(cur.cfg)
      this.meta.cfgAt = cur.at
    } else {
      const c: CloudConfig = { cfg: this.local.config(), at: this.meta.cfgAt || this.now(), dev: this.meta.dev }
      await this.remote.putConfig(c)
      this.cloudCfg = c
      this.meta.cfgAt = c.at
    }
    this.meta.cfgDirty = false
    this.persist()
  }

  private async incoming(list: CloudStory[]) {
    const put: Story[] = []
    const removed: string[] = []
    const locals = new Map(this.local.stories().map((s) => [s.id, s]))
    for (const c of list) {
      // mudança daqui ainda não enviada: o envio decide (e detecta o conflito)
      if (this.meta.dirty.includes(c.id) || this.meta.purged.includes(c.id)) continue
      if (this.meta.base[c.id] === c.rev) continue
      const mine = locals.get(c.id)
      if (c.gone) {
        if (mine) removed.push(c.id)
      } else {
        const s = fromCloud(c)
        // primeira sincronização: a mesma história já está aqui igual
        if (s && !(mine && sameContent(mine, s) && JSON.stringify(mine.v || []) === JSON.stringify(s.v || []))) {
          if (mine && this.meta.base[c.id] === undefined) {
            // existe aqui e lá, diferente, e nunca foi sincronizada: envia, e o envio cria a cópia
            this.meta.dirty.push(c.id)
            continue
          }
          put.push(s)
        }
      }
      this.meta.base[c.id] = c.rev
    }
    if (put.length || removed.length) await this.local.apply(put, removed)
    this.persist()
    if (this.meta.dirty.length) void this.flush()
  }

  private async incomingConfig(c: CloudConfig | null) {
    this.cloudCfg = c
    this.cfgLoaded = true
    if (!c) {
      this.meta.cfgDirty = true
    } else if (c.dev !== this.meta.dev && c.at > this.meta.cfgAt && !this.meta.cfgDirty) {
      await this.local.applyConfig(c.cfg)
      this.meta.cfgAt = c.at
    }
    this.persist()
    if (this.meta.cfgDirty) void this.flush()
  }
}
