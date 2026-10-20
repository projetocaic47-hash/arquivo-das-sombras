import type { Story } from '../data/types'
import { setStory, type DropCap, type Line } from './typeset'

// Montagem das páginas do livro a partir das histórias, na mesma ordem e com a mesma
// numeração do HTML original: página 0 (capa no original; aqui, o verso da capa),
// depois o índice com 8 histórias por página, depois as histórias, cada uma
// começando numa página nova. Não depende de three.js nem do navegador.

export interface TocEntry {
  title: string
  /** número da página onde a história começa */
  page: number
}

export type BookPage =
  | { k: 'endpaper' }
  | { k: 'toc'; first: boolean; count: number; entries: TocEntry[] }
  | { k: 'story'; sid: string; first: boolean; title: string; sub: string; draft: boolean; lines: Line[]; drop?: DropCap }

/** Medidas de uma página, na unidade em que `measure` devolve larguras (pixels da textura). */
export interface PageMetrics {
  /** largura útil de uma linha */
  width: number
  lineHeight: number
  /** altura da área de texto, sem cabeçalho */
  bodyHeight: number
  /** altura do cabeçalho corrido (título pequeno) das páginas seguintes de uma história */
  runningHeader: number
  /** altura do bloco de título na primeira página de uma história */
  firstHeader(s: { title: string; sub: string; draft: boolean }): number
  measure(text: string): number
  /** recuo da primeira linha dos parágrafos */
  indent: number
  /** largura da letra capital com o respiro até o texto */
  dropWidth(letter: string): number
}

export const TOC_PER_PAGE = 8
const UNTITLED = 'Sem título'

/** Histórias que aparecem no livro: fora da lixeira, pela ordem `o` (como `vis()` no original). */
export function visibleStories(stories: Story[]) {
  return stories.filter((s) => !s.del).sort((a, b) => a.o - b.o)
}

/** Quebra o texto em linhas que cabem em `width`, respeitando parágrafos e linhas em branco. */
export function wrapText(text: string, width: number, measure: (t: string) => number): string[] {
  const out: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = para.split(/[ \t]+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (let w of words) {
      // palavra maior que a linha inteira: corta em pedaços
      while (measure(w) > width) {
        let n = w.length - 1
        while (n > 1 && measure(w.slice(0, n)) > width) n--
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(w.slice(0, n))
        w = w.slice(n)
      }
      const next = line ? line + ' ' + w : w
      if (line && measure(next) > width) {
        out.push(line)
        line = w
      } else line = next
    }
    out.push(line)
  }
  return out
}

export function buildPages(stories: Story[], m: PageMetrics): BookPage[] {
  const vis = visibleStories(stories)
  const restLines = Math.max(1, Math.floor((m.bodyHeight - m.runningHeader) / m.lineHeight))
  const storyPages: BookPage[] = []
  const starts: number[] = []
  for (const s of vis) {
    starts.push(storyPages.length)
    const head = { title: s.t || UNTITLED, sub: s.sub || '', draft: s.st === 'd' }
    const firstLines = Math.max(1, Math.floor((m.bodyHeight - m.firstHeader(head)) / m.lineHeight))
    const { lines, drop } = setStory(s.x || '', m)
    let i = 0
    let first = true
    do {
      // uma página não começa com linhas em branco que sobraram da anterior
      if (!first) while (i < lines.length && !lines[i].t) i++
      const n = first ? firstLines : restLines
      if (!first && i >= lines.length) break
      storyPages.push({ k: 'story', sid: s.id, first, ...head, lines: lines.slice(i, i + n), ...(first && drop ? { drop } : {}) })
      i += n
      first = false
    } while (i < lines.length)
  }
  const tocCount = Math.max(1, Math.ceil(vis.length / TOC_PER_PAGE))
  const toc: BookPage[] = []
  for (let j = 0; j < tocCount; j++) {
    const entries = vis.slice(j * TOC_PER_PAGE, (j + 1) * TOC_PER_PAGE).map((s, n) => ({
      title: s.t || UNTITLED,
      page: 1 + tocCount + starts[j * TOC_PER_PAGE + n],
    }))
    toc.push({ k: 'toc', first: j === 0, count: vis.length, entries })
  }
  return [{ k: 'endpaper' }, ...toc, ...storyPages]
}

// Abertas (pares de páginas). A abertura 0 é o livro fechado. Na abertura s ≥ 1 a página
// da esquerda é 2s−2 e a da direita 2s−1: páginas ímpares à direita, como num livro impresso.
// A folha s (s ≥ 1) tem a página 2s−1 na frente e 2s no verso; a folha 0 é a capa.

export function spreadPages(s: number): [number, number] {
  return s <= 0 ? [-1, -1] : [2 * s - 2, 2 * s - 1]
}

export function lastSpread(pageCount: number) {
  return Math.max(1, Math.floor((pageCount + 1) / 2))
}

/** Abertura em que uma página aparece. */
export function spreadOf(page: number) {
  return page < 0 ? 0 : Math.floor(page / 2) + 1
}

/** Páginas da folha que vira ao avançar da abertura s para s+1: [frente, verso]. -1 = capa. */
export function leafPages(s: number): [number, number] {
  return s <= 0 ? [-1, 0] : [2 * s - 1, 2 * s]
}
