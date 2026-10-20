import { describe, expect, it } from 'vitest'
import { applyMerge, backupFileName, normalizeStory, parseBackup, planMerge, serializeBackup } from '../src/data/backup'
import type { Story } from '../src/data/types'

const story = (id: string, extra: Partial<Story> = {}): Story => ({
  id, t: 'T' + id, sub: '', x: 'x' + id, tags: [], st: 'd', note: '',
  fav: false, del: false, c: 1000, u: 2000, o: 1, ...extra,
})

describe('backup', () => {
  it('gera o mesmo formato v1 do original e o lê de volta sem perdas', () => {
    const cfg = { n: 'N', p: 'P', fs: 19, rm: false, lb: 5 }
    const list = [story('a', { v: [{ t: 'velho', x: 'v', u: 1 }] }), story('b', { st: 'f', del: true, o: 2 })]
    const text = serializeBackup(cfg, list, new Date('2026-10-20T00:00:00Z'))
    const raw = JSON.parse(text)
    expect(Object.keys(raw)).toEqual(['app', 'v', 'exported', 'config', 'stories'])
    expect(raw.app).toBe('arquivo-das-sombras')
    expect(raw.v).toBe(1)
    const r = parseBackup(text)
    expect(r.ok && r.stories).toEqual(list)
    expect(r.ok && r.config).toEqual(cfg)
  })

  it('nomeia o arquivo como o original', () => {
    expect(backupFileName(new Date('2026-10-20T12:00:00Z'))).toBe('arquivo-das-sombras-backup-2026-10-20.json')
  })

  it('recusa arquivos inválidos com as mensagens do original', () => {
    expect(parseBackup('não é json')).toEqual({ ok: false, error: 'Arquivo inválido: não é JSON. Nada foi alterado.' })
    const bad = { ok: false, error: 'Arquivo inválido ou incompleto. Nada foi alterado.' }
    expect(parseBackup('{}')).toEqual(bad)
    expect(parseBackup(JSON.stringify({ app: 'outro', stories: [] }))).toEqual(bad)
    expect(parseBackup(JSON.stringify({ app: 'arquivo-das-sombras', stories: [{ id: 1, x: '' }] }))).toEqual(bad)
    expect(parseBackup(JSON.stringify({ app: 'arquivo-das-sombras', stories: [{ id: 'a' }] }))).toEqual(bad)
  })

  it('completa campos ausentes como a função norm do original', () => {
    const s = normalizeStory({ id: 'z', x: 'texto', st: 'qualquer', tags: [1, 'b'], c: 50 }, 4)
    expect(s).toEqual({ id: 'z', t: '', sub: '', x: 'texto', tags: ['1', 'b'], st: 'd', note: '', fav: false, del: false, c: 50, u: 50, o: 5 })
  })
})

describe('mesclagem', () => {
  const current = [story('a', { o: 1 }), story('b', { o: 7, del: true })]

  it('adiciona novas ao final da ordem e conta idênticas', () => {
    const p = planMerge(current, [story('a', { o: 1 }), story('n1', { o: 1 }), story('n2', { o: 1 })], 'keep-current')
    expect(p.identical).toBe(1)
    expect(p.conflicts).toBe(0)
    expect(p.write.map((s) => [s.id, s.o])).toEqual([['n1', 8], ['n2', 9]])
  })

  it('nos conflitos, mantém as atuais ou usa as do backup na mesma posição', () => {
    const changed = story('a', { x: 'outro texto', u: 9999, o: 40 })
    expect(planMerge(current, [changed], 'keep-current')).toEqual({ write: [], conflicts: 1, identical: 0 })
    const p = planMerge(current, [changed], 'use-backup')
    expect(p.write).toEqual([{ ...changed, o: 1 }])
    expect(applyMerge(current, p.write)[0].x).toBe('outro texto')
  })
})
