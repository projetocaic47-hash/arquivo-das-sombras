import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import { DEFAULT_CONFIG, type Config, type Story } from './types'

// Mesmo nome e mesma versão do banco criado pelo HTML original.
// Subir a versão exige uma migração aprovada (ver docs/DADOS.md).
export const DB_NAME = 'arquivo-das-sombras'
export const DB_VERSION = 1

interface ArquivoDB extends DBSchema {
  stories: { key: string; value: Story }
  meta: { key: string; value: Config }
}

export type Db = IDBPDatabase<ArquivoDB>

/** Abre o banco. Em um navegador que já usou o original, nada é criado nem alterado. */
export function openArquivo(): Promise<Db> {
  return openDB<ArquivoDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Igual ao original: só roda quando o banco ainda não existe.
      if (!db.objectStoreNames.contains('stories')) db.createObjectStore('stories', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    },
  })
}

export async function loadAll(db: Db): Promise<{ stories: Story[]; config: Config }> {
  const tx = db.transaction(['stories', 'meta'])
  const [stories, cfg] = await Promise.all([tx.objectStore('stories').getAll(), tx.objectStore('meta').get('cfg')])
  await tx.done
  return { stories, config: { ...DEFAULT_CONFIG, ...cfg } }
}

export async function putStory(db: Db, s: Story): Promise<void> {
  await db.put('stories', s)
}

export async function putStories(db: Db, list: Story[]): Promise<void> {
  await writeAllOrNothing(db, (store, reqs) => list.forEach((s) => reqs.push(store.put(s))))
}

export async function deleteStory(db: Db, id: string): Promise<void> {
  await db.delete('stories', id)
}

export async function saveConfig(db: Db, c: Config): Promise<void> {
  await db.put('meta', c, 'cfg')
}

/** Substitui todo o acervo numa única transação: se falhar, nada muda. */
export async function replaceAll(db: Db, list: Story[]): Promise<void> {
  await writeAllOrNothing(db, (store, reqs) => {
    reqs.push(store.clear())
    list.forEach((s) => reqs.push(store.put(s)))
  })
}

type StoriesStore = IDBPObjectStore<ArquivoDB, ['stories'], 'stories', 'readwrite'>

/**
 * Executa várias gravações numa transação. Se qualquer uma for recusada
 * (inclusive com erro imediato, como um registro sem id), a transação é
 * desfeita por inteiro e o erro é repassado.
 */
async function writeAllOrNothing(db: Db, fill: (store: StoriesStore, reqs: Promise<unknown>[]) => void): Promise<void> {
  const tx = db.transaction('stories', 'readwrite')
  const reqs: Promise<unknown>[] = []
  try {
    fill(tx.store, reqs)
    await Promise.all([...reqs, tx.done])
  } catch (e) {
    // depois do abort as demais gravações também falham; essas falhas já são esperadas
    reqs.forEach((r) => r.catch(() => {}))
    tx.done.catch(() => {})
    try {
      tx.abort()
    } catch {
      // a transação já tinha sido abortada pelo navegador
    }
    throw e
  }
}
