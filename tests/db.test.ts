import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { DB_NAME, loadAll, openArquivo, putStory, replaceAll, saveConfig } from '../src/data/db'
import type { Story } from '../src/data/types'

const story = (id: string, extra: Partial<Story> = {}): Story => ({
  id, t: 'Título ' + id, sub: '', x: 'texto de ' + id, tags: [], st: 'd', note: '',
  fav: false, del: false, c: 1000, u: 2000, o: 1, ...extra,
})

/** Abre o banco exatamente como a função idb() do HTML original. */
function openLikeOriginal(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('arquivo-das-sombras', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('stories', { keyPath: 'id' })
      r.result.createObjectStore('meta')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

function writeRaw(db: IDBDatabase, store: string, value: unknown, key?: string): Promise<void> {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite')
    t.objectStore(store).put(value, key)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('banco IndexedDB', () => {
  it('cria o banco v1 com as mesmas gavetas do original quando ele não existe', async () => {
    const db = await openArquivo()
    expect(db.name).toBe(DB_NAME)
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames].sort()).toEqual(['meta', 'stories'])
    db.close()
  })

  it('lê sem alterar um banco criado e preenchido pelo HTML original', async () => {
    const old = await openLikeOriginal()
    const s = story('abc', { st: 'f', tags: ['noite'], v: [{ t: 'antes', x: 'velho', u: 1500 }], fav: true })
    const cfg = { n: 'MEU ACERVO', p: 'frase', fs: 22, rm: true, pos: { sid: 'abc', off: 2 }, bm: [{ sid: 'abc', off: 1 }], lb: 3000 }
    await writeRaw(old, 'stories', s)
    await writeRaw(old, 'meta', cfg, 'cfg')
    old.close()

    const db = await openArquivo()
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames].sort()).toEqual(['meta', 'stories'])
    const { stories, config } = await loadAll(db)
    expect(stories).toEqual([s])
    expect(config).toEqual(cfg)
    db.close()

    // o original continua conseguindo abrir e ler o mesmo banco
    const again = await openLikeOriginal()
    expect(again.version).toBe(1)
    again.close()
  })

  it('completa a configuração com os valores padrão quando ainda não há registro cfg', async () => {
    const db = await openArquivo()
    const { stories, config } = await loadAll(db)
    expect(stories).toEqual([])
    expect(config).toEqual({ n: 'ARQUIVO DAS SOMBRAS', p: 'o que o tempo não conseguiu apagar', fs: 19, rm: false })
    db.close()
  })

  it('grava histórias e configuração nos mesmos lugares que o original', async () => {
    const db = await openArquivo()
    await putStory(db, story('x1'))
    await saveConfig(db, { n: 'A', p: 'B', fs: 18, rm: false })
    expect(await db.get('stories', 'x1')).toEqual(story('x1'))
    expect(await db.get('meta', 'cfg')).toEqual({ n: 'A', p: 'B', fs: 18, rm: false })
    db.close()
  })

  it('substituir o acervo é tudo ou nada: com um registro inválido, nada muda', async () => {
    const db = await openArquivo()
    await putStory(db, story('fica'))
    const bad = { t: 'sem id' } as unknown as Story
    await expect(replaceAll(db, [story('novo'), bad])).rejects.toBeTruthy()
    const { stories } = await loadAll(db)
    expect(stories.map((s) => s.id)).toEqual(['fica'])
    await replaceAll(db, [story('novo')])
    expect((await loadAll(db)).stories.map((s) => s.id)).toEqual(['novo'])
    db.close()
  })
})
