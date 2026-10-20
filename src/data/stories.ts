import type { Story } from './types'

// Regras das histórias portadas do HTML original (editor, acervo e exportação).
// Não dependem do navegador nem do banco: a interface chama, o banco grava.

/** Mesmo formato de id do original: tempo em base 36 + sorteio. */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export function words(x: string) {
  return (x.match(/\S+/g) || []).length
}

export function dateBR(ms: number) {
  return new Date(ms).toLocaleDateString('pt-BR')
}

/** Folha nova, ainda não gravada (o original só grava quando há título, subtítulo ou texto). */
export function blankStory(now = Date.now()): Story {
  return { id: uid(), t: '', sub: '', x: '', tags: [], st: 'd', note: '', fav: false, del: false, c: now, u: now, o: 0 }
}

export function isEmpty(s: Pick<Story, 't' | 'sub' | 'x'>) {
  return !s.t && !s.sub && !s.x
}

export function nextOrder(all: Story[]) {
  return all.reduce((m, s) => Math.max(m, s.o), 0) + 1
}

/** Etiquetas digitadas separadas por vírgula. */
export function parseTags(text: string) {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export const MAX_VERSIONS = 15
const VERSION_GAP = 10 * 60 * 1000

/**
 * Antes de gravar uma edição: se o texto mudou e a última versão tem mais de 10 minutos,
 * guarda o texto anterior como versão (no máximo 15), como o original.
 */
export function withVersion(saved: Story, nextText: string, now = Date.now()): Story['v'] {
  const v = saved.v ? saved.v.slice() : []
  if (nextText === saved.x) return saved.v
  const last = v[v.length - 1]
  if (!last || now - last.u > VERSION_GAP) {
    v.push({ t: saved.t, x: saved.x, u: now })
    if (v.length > MAX_VERSIONS) v.shift()
  }
  return v
}

/** Ao restaurar uma versão, o texto atual vira uma versão também (nada se perde). */
export function pushVersion(v: Story['v'], t: string, x: string, now = Date.now()) {
  const out = v ? v.slice() : []
  out.push({ t, x, u: now })
  if (out.length > MAX_VERSIONS) out.shift()
  return out
}

/** Rascunhos visíveis, do mais recente para o mais antigo (as "folhas soltas"). */
export function drafts(all: Story[]) {
  return all.filter((s) => !s.del && s.st === 'd').sort((a, b) => b.u - a.u)
}

export type SortKey = 'o' | 't' | 'c' | 'u'
export interface LibraryQuery {
  q: string
  /** '' todas, 'd' rascunhos, 'f' finalizadas */
  f: '' | 'd' | 'f'
  /** etiqueta */
  g: string
  o: SortKey
  /** mostrando a lixeira */
  tr: boolean
}

export const EMPTY_QUERY: LibraryQuery = { q: '', f: '', g: '', o: 'o', tr: false }

export interface LibraryItem {
  story: Story
  /** trecho do texto em volta da busca */
  snippet: string
}

/** Lista do acervo com busca, filtros e ordem, igual à função list() do original. */
export function libraryList(all: Story[], lq: LibraryQuery): LibraryItem[] {
  const q = lq.q.toLowerCase()
  let v = all.filter((s) => !!s.del === lq.tr).sort((a, b) => a.o - b.o)
  if (!lq.tr && lq.o !== 'o') {
    const cmp =
      lq.o === 't'
        ? (a: Story, b: Story) => (a.t || '').localeCompare(b.t || '')
        : lq.o === 'c'
          ? (a: Story, b: Story) => b.c - a.c
          : (a: Story, b: Story) => b.u - a.u
    v = v.slice().sort(cmp)
  }
  const out: LibraryItem[] = []
  for (const s of v) {
    const all = `${s.t || ''} ${s.sub || ''} ${(s.tags || []).join(' ')} ${s.x}`.toLowerCase()
    if (q && !all.includes(q)) continue
    if (lq.f && s.st !== lq.f) continue
    if (lq.g && !(s.tags || []).includes(lq.g)) continue
    let snippet = ''
    if (q) {
      const k = s.x.toLowerCase().indexOf(q)
      if (k >= 0) snippet = '…' + s.x.slice(Math.max(0, k - 35), k + 60).replace(/\s+/g, ' ') + '…'
    }
    out.push({ story: s, snippet })
  }
  return out
}

export function allTags(all: Story[]) {
  const t = new Set<string>()
  all.forEach((s) => (s.tags || []).forEach((x) => t.add(x)))
  return [...t]
}

/** Troca a posição no livro com a vizinha (↑ ou ↓); devolve as duas alteradas ou nada. */
export function swapOrder(all: Story[], id: string, d: 1 | -1): Story[] {
  const v = all.filter((s) => !s.del).sort((a, b) => a.o - b.o)
  const i = v.findIndex((s) => s.id === id)
  const j = i + d
  if (i < 0 || j < 0 || j >= v.length) return []
  return [
    { ...v[i], o: v[j].o },
    { ...v[j], o: v[i].o },
  ]
}

export function duplicate(all: Story[], s: Story, now = Date.now()): Story {
  const d: Story = JSON.parse(JSON.stringify(s))
  d.id = uid()
  d.t = (s.t || 'Sem título') + ' (cópia)'
  d.c = d.u = now
  d.o = nextOrder(all)
  return d
}

/** Texto para exportar (.txt ou .md), como tof() no original. */
export function storyText(s: Story, md: boolean) {
  const t = s.t || 'Sem título'
  return (md ? `# ${t}\n\n${s.sub ? `*${s.sub}*\n\n` : ''}` : `${t}\n${s.sub ? s.sub + '\n' : ''}\n`) + s.x
}

export function slug(s: Story) {
  return (
    (s.t || 'historia')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'historia'
  )
}

/** Todas as histórias do livro num só .md, separadas por ---. */
export function allMarkdown(all: Story[]) {
  return all
    .filter((s) => !s.del)
    .sort((a, b) => a.o - b.o)
    .map((s) => storyText(s, true))
    .join('\n\n---\n\n')
}

export function stats(all: Story[]) {
  const v = all.filter((s) => !s.del)
  return {
    visible: v.length,
    words: v.reduce((n, s) => n + words(s.x), 0),
    drafts: v.filter((s) => s.st === 'd').length,
    trash: all.length - v.length,
    lastEdit: all.reduce((m, s) => Math.max(m, s.u), 0),
  }
}
