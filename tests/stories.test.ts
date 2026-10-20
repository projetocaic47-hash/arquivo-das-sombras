import { describe, expect, it } from 'vitest'
import {
  allMarkdown,
  duplicate,
  libraryList,
  EMPTY_QUERY,
  parseTags,
  pushVersion,
  slug,
  storyText,
  swapOrder,
  withVersion,
  drafts,
} from '../src/data/stories'
import type { Story } from '../src/data/types'

const base = (o: Partial<Story>): Story => ({ id: 'a', t: '', sub: '', x: '', tags: [], st: 'd', note: '', fav: false, del: false, c: 1, u: 1, o: 1, ...o })

const list = [
  base({ id: 'a', t: 'A vela', x: 'A chuva batia na janela', tags: ['noite'], st: 'f', o: 1, c: 10, u: 50 }),
  base({ id: 'b', t: 'Cartas', x: 'Nenhuma carta foi enviada', tags: ['cartas', 'noite'], o: 2, c: 30, u: 20 }),
  base({ id: 'c', t: 'Baú', x: 'velho', o: 3, c: 20, u: 40 }),
  base({ id: 'z', t: 'Lixo', x: 'apagada', del: true, o: 4 }),
]

describe('regras das histórias', () => {
  it('filtra e ordena o acervo como o original', () => {
    expect(libraryList(list, EMPTY_QUERY).map((i) => i.story.id)).toEqual(['a', 'b', 'c'])
    expect(libraryList(list, { ...EMPTY_QUERY, o: 't' }).map((i) => i.story.id)).toEqual(['a', 'c', 'b'])
    expect(libraryList(list, { ...EMPTY_QUERY, o: 'c' }).map((i) => i.story.id)).toEqual(['b', 'c', 'a'])
    expect(libraryList(list, { ...EMPTY_QUERY, o: 'u' }).map((i) => i.story.id)).toEqual(['a', 'c', 'b'])
    expect(libraryList(list, { ...EMPTY_QUERY, f: 'f' }).map((i) => i.story.id)).toEqual(['a'])
    expect(libraryList(list, { ...EMPTY_QUERY, g: 'cartas' }).map((i) => i.story.id)).toEqual(['b'])
    expect(libraryList(list, { ...EMPTY_QUERY, tr: true }).map((i) => i.story.id)).toEqual(['z'])
    const found = libraryList(list, { ...EMPTY_QUERY, q: 'JANELA' })
    expect(found.map((i) => i.story.id)).toEqual(['a'])
    expect(found[0].snippet).toContain('janela')
  })

  it('troca a ordem só entre vizinhas e não passa das pontas', () => {
    const r = swapOrder(list, 'b', -1)
    expect(r.map((s) => [s.id, s.o])).toEqual([
      ['b', 1],
      ['a', 2],
    ])
    expect(swapOrder(list, 'a', -1)).toEqual([])
    expect(swapOrder(list, 'c', 1)).toEqual([])
  })

  it('guarda versões a cada 10 minutos de edição, no máximo 15', () => {
    const s = base({ t: 'T', x: 'um' })
    const v1 = withVersion(s, 'dois', 1_000_000)!
    expect(v1).toEqual([{ t: 'T', x: 'um', u: 1_000_000 }])
    // menos de 10 minutos depois: não cria outra
    expect(withVersion({ ...s, x: 'dois', v: v1 }, 'três', 1_000_000 + 60_000)).toHaveLength(1)
    // sem mudança no texto: nada
    expect(withVersion(s, 'um', 9e9)).toBeUndefined()
    let v: Story['v'] = []
    for (let i = 0; i < 20; i++) v = pushVersion(v, 'T', String(i), i)
    expect(v).toHaveLength(15)
    expect(v![0].x).toBe('5')
  })

  it('exporta, duplica e lê etiquetas como o original', () => {
    const s = list[0]
    expect(storyText(s, false)).toBe('A vela\n\nA chuva batia na janela')
    expect(storyText({ ...s, sub: 'sub' }, true)).toBe('# A vela\n\n*sub*\n\nA chuva batia na janela')
    expect(slug(base({ t: 'Cartas que não foram enviadas!' }))).toBe('cartas-que-nao-foram-enviadas')
    expect(slug(base({ t: '' }))).toBe('historia')
    expect(allMarkdown(list).split('\n\n---\n\n')).toHaveLength(3)
    const d = duplicate(list, s, 99)
    expect(d.t).toBe('A vela (cópia)')
    expect(d.o).toBe(5)
    expect(d.id).not.toBe(s.id)
    expect(parseTags(' noite, , cartas ,')).toEqual(['noite', 'cartas'])
    expect(drafts(list).map((x) => x.id)).toEqual(['c', 'b'])
  })
})
