import { describe, expect, it } from 'vitest'
import { buildPages, lastSpread, leafPages, spreadOf, spreadPages, wrapText, type PageMetrics } from '../src/book/pages'
import type { Story } from '../src/data/types'

// medida simples: cada caractere ocupa 1 unidade
const metrics: PageMetrics = {
  width: 20,
  lineHeight: 1,
  bodyHeight: 10,
  runningHeader: 2,
  firstHeader: (s) => 3 + (s.sub ? 1 : 0) + (s.draft ? 1 : 0),
  measure: (t) => t.length,
}

const story = (id: string, o: number, x: string, extra: Partial<Story> = {}): Story => ({
  id, t: 'T' + id, sub: '', x, tags: [], st: 'f', note: '', fav: false, del: false, c: 0, u: 0, o, ...extra,
})

describe('wrapText', () => {
  it('quebra por palavras sem passar da largura e mantém linhas em branco', () => {
    const l = wrapText('um dois tres quatro cinco seis\n\nfim', 12, (t) => t.length)
    expect(l).toEqual(['um dois tres', 'quatro cinco', 'seis', '', 'fim'])
    expect(l.every((x) => x.length <= 12)).toBe(true)
  })
  it('corta palavras maiores que a linha', () => {
    expect(wrapText('abcdefghij', 4, (t) => t.length)).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('buildPages', () => {
  it('segue a ordem e a numeração do original: verso da capa, índice, histórias', () => {
    const long = Array.from({ length: 30 }, (_, i) => 'linha' + i).join('\n')
    const pages = buildPages([story('b', 2, 'curta'), story('a', 1, long), story('z', 3, 'apagada', { del: true })], metrics)
    expect(pages[0].k).toBe('endpaper')
    expect(pages[1]).toMatchObject({ k: 'toc', count: 2 })
    const toc = pages[1].k === 'toc' ? pages[1].entries : []
    expect(toc.map((e) => e.title)).toEqual(['Ta', 'Tb'])
    // a história 'a' começa na página 2, logo após o índice
    expect(toc[0].page).toBe(2)
    expect(pages[2]).toMatchObject({ k: 'story', sid: 'a', first: true })
    // 30 linhas: 7 na primeira página (10 − 3 de título), 8 nas seguintes (10 − 2 de cabeçalho)
    const a = pages.filter((p) => p.k === 'story' && p.sid === 'a')
    expect(a.map((p) => (p.k === 'story' ? p.lines.length : 0))).toEqual([7, 8, 8, 7])
    expect(toc[1].page).toBe(2 + a.length)
    expect(pages[toc[1].page]).toMatchObject({ sid: 'b', first: true })
    // nada se perde nem se repete
    expect(a.flatMap((p) => (p.k === 'story' ? p.lines : []))).toEqual(long.split('\n'))
    expect(pages.some((p) => p.k === 'story' && p.sid === 'z')).toBe(false)
  })
  it('acervo vazio: verso da capa e um índice vazio', () => {
    const pages = buildPages([], metrics)
    expect(pages).toEqual([{ k: 'endpaper' }, { k: 'toc', first: true, count: 0, entries: [] }])
  })
  it('índice com mais de 8 histórias ocupa mais páginas e numera certo', () => {
    const list = Array.from({ length: 10 }, (_, i) => story('s' + i, i, 'x'))
    const pages = buildPages(list, metrics)
    expect(pages.filter((p) => p.k === 'toc').length).toBe(2)
    const second = pages[2].k === 'toc' ? pages[2].entries : []
    expect(second.map((e) => e.page)).toEqual([11, 12])
    expect(pages[11]).toMatchObject({ sid: 's8', first: true })
  })
})

describe('aberturas e folhas', () => {
  it('páginas ímpares à direita e folhas coerentes com as aberturas', () => {
    expect(spreadPages(1)).toEqual([0, 1])
    expect(spreadPages(3)).toEqual([4, 5])
    for (let s = 0; s < 6; s++) {
      const [front, back] = leafPages(s)
      // a frente da folha é a página da direita da abertura atual; o verso, a da esquerda da próxima
      if (s > 0) expect(front).toBe(spreadPages(s)[1])
      expect(back).toBe(spreadPages(s + 1)[0])
    }
    for (let p = 0; p < 12; p++) expect(spreadPages(spreadOf(p))).toContain(p)
    expect(lastSpread(2)).toBe(1)
    expect(lastSpread(3)).toBe(2)
    expect(lastSpread(4)).toBe(2)
  })
})
