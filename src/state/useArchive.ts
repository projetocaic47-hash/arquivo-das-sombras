import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMerge, backupFileName, parseBackup, planMerge, serializeBackup, type MergeMode } from '../data/backup'
import { deleteStory, loadAll, openArquivo, putStories, replaceAll, saveConfig, type Db } from '../data/db'
import { connectCloud } from '../data/cloud'
import { newMeta, SyncEngine, type SyncMeta, type SyncStatus } from '../data/sync'
import { DEFAULT_CONFIG, type Config, type Story } from '../data/types'

const OFF: SyncStatus = { state: 'off', pending: 0, conflicts: 0, tooBig: [] }

/** O que este aparelho lembra da sincronização, por conta (o conteúdo continua no IndexedDB). */
function loadMeta(user: string): SyncMeta {
  try {
    const m = JSON.parse(localStorage.getItem('arquivo-nuvem:' + user) || 'null') as SyncMeta | null
    if (m && typeof m.dev === 'string' && m.base && Array.isArray(m.dirty) && Array.isArray(m.purged)) return m
  } catch {
    // sem localStorage: começa do zero (a primeira sincronização compara tudo e não apaga nada)
  }
  return newMeta(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
}
function saveMeta(user: string, m: SyncMeta) {
  try {
    localStorage.setItem('arquivo-nuvem:' + user, JSON.stringify(m))
  } catch {
    // sem localStorage: o que falta enviar é recalculado na próxima visita
  }
}

export type ArchiveStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }

/** Estado do acervo em memória, sempre gravado no IndexedDB antes de ser atualizado na tela. */
export function useArchive() {
  const db = useRef<Db | null>(null)
  const [status, setStatus] = useState<ArchiveStatus>({ kind: 'loading' })
  const [stories, setStoriesState] = useState<Story[]>([])
  // acervo mais recente, para a sincronização ler fora do ciclo da tela
  const storiesRef = useRef<Story[]>([])
  const setStories = (next: Story[]) => {
    storiesRef.current = next
    setStoriesState(next)
  }
  const sync = useRef<SyncEngine | null>(null)
  const [cloud, setCloud] = useState<SyncStatus>(OFF)
  const [config, setConfigState] = useState<Config>(DEFAULT_CONFIG)
  // ajustes mais recentes, inclusive os ainda sendo gravados (várias mudanças seguidas não se perdem)
  const cfgRef = useRef(config)
  const setConfig = (c: Config) => {
    cfgRef.current = c
    setConfigState(c)
  }

  useEffect(() => {
    let alive = true
    let stopSync = () => {}
    const online = () => void sync.current?.online()
    addEventListener('online', online)
    openArquivo()
      .then(async (d) => {
        db.current = d
        const r = await loadAll(d)
        if (!alive) return
        setStories(r.stories)
        setConfig(r.config)
        setStatus({ kind: 'ready' })
        // igual ao original: pede ao navegador para não apagar o armazenamento sozinho
        navigator.storage?.persist?.().catch(() => {})
        // nuvem: só no link do claude.ai, com a pessoa conectada
        const c = await connectCloud()
        if (!alive || !c) return
        const eng = new SyncEngine(
          c.remote,
          {
            stories: () => storiesRef.current,
            config: () => cfgRef.current,
            // o que chega da nuvem é gravado no IndexedDB antes de aparecer
            apply: async (put, removed) => {
              if (put.length) await putStories(d, put)
              for (const id of removed) await deleteStory(d, id)
              setStories(applyMerge(storiesRef.current, put).filter((s) => !removed.includes(s.id)))
            },
            applyConfig: async (cfg) => {
              const next = { ...DEFAULT_CONFIG, ...cfg }
              await saveConfig(d, next)
              setConfig(next)
            },
          },
          loadMeta(c.user),
          (m) => saveMeta(c.user, m),
        )
        sync.current = eng
        stopSync = eng.subscribe(setCloud)
        eng.start()
      })
      .catch((e: Error) => {
        if (alive)
          setStatus({ kind: 'error', message: `O armazenamento local não está disponível (${e.message}). Nada será salvo ao fechar. Use o backup.` })
      })
    return () => {
      alive = false
      removeEventListener('online', online)
      stopSync()
      sync.current?.stop()
      sync.current = null
      db.current?.close()
    }
  }, [])

  const need = () => {
    if (!db.current) throw new Error('armazenamento indisponível')
    return db.current
  }

  /** Texto do backup; registra a data do último backup como o original. */
  const exportBackup = useCallback(async () => {
    const now = new Date()
    const next = { ...cfgRef.current, lb: now.getTime() }
    await saveConfig(need(), next)
    setConfig(next)
    void sync.current?.configChanged()
    return { name: backupFileName(now), text: serializeBackup(next, stories, now) }
  }, [config, stories])

  const importReplace = useCallback(async (list: Story[], cfg?: Record<string, unknown>) => {
    const d = need()
    const gone = storiesRef.current.filter((s) => !list.some((n) => n.id === s.id)).map((s) => s.id)
    await replaceAll(d, list)
    setStories(list)
    if (cfg) {
      const next = { ...cfgRef.current, ...cfg } as Config
      await saveConfig(d, next)
      setConfig(next)
      void sync.current?.configChanged()
    }
    if (gone.length) void sync.current?.purged(gone)
    void sync.current?.changed(list.map((s) => s.id))
  }, [config])

  const importMerge = useCallback(async (list: Story[], mode: MergeMode) => {
    const plan = planMerge(stories, list, mode)
    await putStories(need(), plan.write)
    setStories(applyMerge(storiesRef.current, plan.write))
    void sync.current?.changed(plan.write.map((s) => s.id))
    return plan
  }, [stories])

  /** Grava uma ou mais histórias (novas ou alteradas) numa transação e só então mostra. */
  const saveStories = useCallback(async (list: Story[]) => {
    if (!list.length) return
    await putStories(need(), list)
    setStories(applyMerge(storiesRef.current, list))
    void sync.current?.changed(list.map((s) => s.id))
  }, [])

  /** Exclui de vez (só a partir da lixeira, como no original). */
  const purgeStory = useCallback(async (id: string) => {
    await deleteStory(need(), id)
    setStories(storiesRef.current.filter((s) => s.id !== id))
    void sync.current?.purged([id])
  }, [])

  /** Altera os ajustes; grava primeiro. */
  const updateConfig = useCallback(async (patch: Partial<Config>) => {
    const next = { ...cfgRef.current, ...patch }
    cfgRef.current = next
    await saveConfig(need(), next)
    setConfigState(next)
    void sync.current?.configChanged()
  }, [])

  return { status, cloud, stories, config, exportBackup, importReplace, importMerge, parseBackup, saveStories, purgeStory, updateConfig }
}

/** O acervo aberto, compartilhado entre a interface e o livro 3D. */
export type Archive = ReturnType<typeof useArchive>
