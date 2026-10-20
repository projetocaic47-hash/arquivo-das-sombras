import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMerge, backupFileName, parseBackup, planMerge, serializeBackup, type MergeMode } from '../data/backup'
import { loadAll, openArquivo, putStories, replaceAll, saveConfig, type Db } from '../data/db'
import { DEFAULT_CONFIG, type Config, type Story } from '../data/types'

export type ArchiveStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string }

/** Estado do acervo em memória, sempre gravado no IndexedDB antes de ser atualizado na tela. */
export function useArchive() {
  const db = useRef<Db | null>(null)
  const [status, setStatus] = useState<ArchiveStatus>({ kind: 'loading' })
  const [stories, setStories] = useState<Story[]>([])
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)

  useEffect(() => {
    let alive = true
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
      })
      .catch((e: Error) => {
        if (alive)
          setStatus({ kind: 'error', message: `O armazenamento local não está disponível (${e.message}). Nada será salvo ao fechar. Use o backup.` })
      })
    return () => {
      alive = false
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
    const next = { ...config, lb: now.getTime() }
    await saveConfig(need(), next)
    setConfig(next)
    return { name: backupFileName(now), text: serializeBackup(next, stories, now) }
  }, [config, stories])

  const importReplace = useCallback(async (list: Story[], cfg?: Record<string, unknown>) => {
    const d = need()
    await replaceAll(d, list)
    setStories(list)
    if (cfg) {
      const next = { ...config, ...cfg } as Config
      await saveConfig(d, next)
      setConfig(next)
    }
  }, [config])

  const importMerge = useCallback(async (list: Story[], mode: MergeMode) => {
    const plan = planMerge(stories, list, mode)
    await putStories(need(), plan.write)
    setStories((cur) => applyMerge(cur, plan.write))
    return plan
  }, [stories])

  return { status, stories, config, exportBackup, importReplace, importMerge, parseBackup }
}
