import '@fontsource/pixelify-sans/latin-600.css'
import '@fontsource/pixelify-sans/latin-ext-600.css'
import '@fontsource/jacquarda-bastarda-9/latin-400.css'
import '@fontsource/jacquarda-bastarda-9/latin-ext-400.css'
import * as THREE from 'three'
import type { Config } from '../../data/types'
import type { BookPage, PageMetrics } from '../../book/pages'

// Desenho das páginas do livro em textura, com letra em pixel: Pixelify Sans no texto
// e Jacquarda Bastarda 9 (gótica pixelada) nos títulos, ambas com licença OFL.

/** Tamanho da textura de uma página, na proporção da página 3D (0,17 × 0,245 m). */
export const PW = 400
export const PH = 576
const M = { gutter: 34, outer: 26, top: 38, bottom: 50 }
// peso 600: traço mais grosso, que resiste a ser reduzido para poucos pixels
// texto em peso 600: traço mais grosso, que resiste a ser reduzido para poucos pixels
const BODY = `"Pixelify Sans", monospace`
const GOTHIC = `"Jacquarda Bastarda 9", "Pixelify Sans", serif`
const C = { paper: '#ddd2b4', paper2: '#b3a483', ink: '#1c150e', soft: '#463b2c', wine: '#8a3a46', gold: '#9a7a3a' }

export interface PageStyle {
  /** corpo do texto em px da textura, a partir do tamanho de letra salvo no original (fs) */
  font: number
  line: number
  title: number
}

export function pageStyle(cfg: Config): PageStyle {
  const font = Math.round(Math.min(28, Math.max(15, cfg.fs || 19)))
  // a fonte gótica é desenhada numa grade de 9 px: múltiplos de 9 ficam nítidos
  return { font, line: Math.round(font * 1.45), title: font >= 18 ? 45 : 36 }
}

let fontsReady: Promise<unknown> | null = null
/** As fontes precisam estar carregadas antes de medir e paginar. */
export function loadPageFonts() {
  fontsReady ??= Promise.all([
    document.fonts.load(`600 16px ${BODY}`, 'Áá'),
    document.fonts.load(`36px ${GOTHIC}`, 'Áá'),
  ]).catch(() => undefined)
  return fontsReady
}

const measureCtx = () => document.createElement('canvas').getContext('2d')!

/**
 * Letra capital: gótica, em vinho, da altura de três linhas (do alto das maiúsculas da
 * primeira linha até a base da terceira). Tamanho em múltiplos de 9, a grade da fonte.
 */
function dropFont(ctx: CanvasRenderingContext2D, st: PageStyle) {
  const target = 2 * st.line + Math.round(st.font * 0.72)
  ctx.font = `90px ${GOTHIC}`
  const ascent = ctx.measureText('H').actualBoundingBoxAscent || 63
  const size = Math.max(36, Math.round((target * 90) / ascent / 9) * 9)
  return `${size}px ${GOTHIC}`
}
const DROP_GAP = 7

// O travessão da fonte de pixels é curto como um hífen; no texto das histórias ele é
// desenhado como um traço da largura de um "M", na altura e espessura do hífen.
const DASH = '—'
const dashWidth = (ctx: CanvasRenderingContext2D) => Math.round(ctx.measureText('M').width)

/** Largura do texto, com o travessão longo. */
function textWidth(ctx: CanvasRenderingContext2D, t: string) {
  const parts = t.split(DASH)
  return parts.reduce((w, p) => w + ctx.measureText(p).width, 0) + (parts.length - 1) * dashWidth(ctx)
}

/** Escreve o texto, com o travessão longo. */
function drawText(ctx: CanvasRenderingContext2D, t: string, x: number, y: number) {
  const parts = t.split(DASH)
  const dw = dashWidth(ctx)
  const h = ctx.measureText('-')
  const top = Math.round(h.actualBoundingBoxAscent)
  const thick = Math.max(1, Math.round(h.actualBoundingBoxAscent + h.actualBoundingBoxDescent))
  parts.forEach((p, i) => {
    ctx.fillText(p, x, y)
    x += ctx.measureText(p).width
    if (i < parts.length - 1) {
      ctx.fillRect(Math.round(x + 1), y - top, dw - 2, thick)
      x += dw
    }
  })
}

/** Letra dos títulos: a gótica, exceto em textos todos em maiúsculas, que nela ficam ilegíveis. */
function titleFont(text: string, st: PageStyle) {
  const caps = /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase('pt-BR')
  return caps ? `600 ${Math.round(st.title * 0.62)}px ${BODY}` : `${st.title}px ${GOTHIC}`
}

function titleLines(ctx: CanvasRenderingContext2D, title: string, st: PageStyle) {
  ctx.font = titleFont(title, st)
  const width = PW - M.gutter - M.outer
  const words = title.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? line + ' ' + w : w
    if (line && ctx.measureText(next).width > width) {
      out.push(line)
      line = w
    } else line = next
  }
  out.push(line)
  return out.slice(0, 3)
}

export function pageMetrics(st: PageStyle): PageMetrics {
  const ctx = measureCtx()
  return {
    width: PW - M.gutter - M.outer,
    lineHeight: st.line,
    bodyHeight: PH - M.top - M.bottom,
    runningHeader: 30,
    firstHeader: (s) => {
      const t = titleLines(ctx, s.title, st).length * Math.round(st.title * 0.95)
      return t + (s.sub ? st.line + 4 : 0) + (s.draft ? st.line : 0) + 22
    },
    measure: (t) => {
      ctx.font = `600 ${st.font}px ${BODY}`
      return textWidth(ctx, t)
    },
    indent: Math.round(st.font * 1.6),
    dropWidth: (letter) => {
      ctx.font = dropFont(ctx, st)
      return Math.ceil(ctx.measureText(letter).width) + DROP_GAP
    },
  }
}

/** Ruído fixo por página, para o papel não ficar liso demais (sem sorteio a cada desenho). */
function speckle(ctx: CanvasRenderingContext2D, seed: number) {
  let s = (seed * 9301 + 49297) % 233280
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,70,40,0.10)' : 'rgba(255,250,230,0.10)'
    ctx.fillRect(Math.floor(rnd() * PW), Math.floor(rnd() * PH), 2, 2)
  }
}

function paper(ctx: CanvasRenderingContext2D, index: number) {
  // páginas ímpares ficam à direita: a lombada está à esquerda delas
  const gutterLeft = index % 2 === 1
  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, PW, PH)
  const g = ctx.createLinearGradient(gutterLeft ? 0 : PW, 0, gutterLeft ? 26 : PW - 26, 0)
  g.addColorStop(0, 'rgba(120,95,60,0.22)')
  g.addColorStop(1, 'rgba(120,95,60,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, PW, PH)
  // bordas gastas
  ctx.strokeStyle = 'rgba(140,115,75,0.35)'
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, PW, PH)
  speckle(ctx, index + 7)
  return gutterLeft
}

function ornament(ctx: CanvasRenderingContext2D, cx: number, y: number, color: string) {
  ctx.fillStyle = color
  const dia = (x: number, r: number) => {
    for (let k = -r; k <= r; k++) ctx.fillRect(x - (r - Math.abs(k)) * 2, y + k * 2, (r - Math.abs(k)) * 4 + 2, 2)
  }
  dia(cx - 30, 2)
  dia(cx, 4)
  dia(cx + 30, 2)
}

function pageNumber(ctx: CanvasRenderingContext2D, n: number, st: PageStyle) {
  ctx.fillStyle = C.soft
  ctx.font = `600 ${Math.max(12, st.font - 2)}px ${BODY}`
  ctx.textAlign = 'center'
  ctx.fillText(`— ${n} —`, PW / 2, PH - 22)
  ctx.textAlign = 'left'
}

/** Desenha a página `index` do livro. `page` ausente = página em branco. */
/** Áreas clicáveis do índice: faixa vertical (pixels da página) e a página de destino. */
export interface TocHit {
  y0: number
  y1: number
  page: number
}

/** Fita de marcador pendurada no alto da página, do lado de fora. */
function ribbon(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = C.wine
  ctx.fillRect(x, 0, 14, 62)
  ctx.beginPath()
  ctx.moveTo(x, 62)
  ctx.lineTo(x + 7, 54)
  ctx.lineTo(x + 14, 62)
  ctx.lineTo(x + 14, 70)
  ctx.lineTo(x + 7, 62)
  ctx.lineTo(x, 70)
  ctx.closePath()
  ctx.fill()
}

export function drawPage(
  ctx: CanvasRenderingContext2D,
  index: number,
  page: BookPage | undefined,
  st: PageStyle,
  cfg: Config,
  marked = false,
  hits: TocHit[] = [],
) {
  const gutterLeft = paper(ctx, index)
  const left = gutterLeft ? M.gutter : M.outer
  const right = PW - (gutterLeft ? M.outer : M.gutter)
  const cx = (left + right) / 2
  ctx.textBaseline = 'alphabetic'
  if (!page) return
  if (page.k === 'endpaper') {
    ctx.textAlign = 'center'
    ornament(ctx, cx, 170, C.gold)
    ctx.fillStyle = C.soft
    ctx.font = `600 ${st.font - 2}px ${BODY}`
    ctx.fillText('acervo de histórias', cx, 230)
    ctx.fillStyle = C.ink
    const name = titleLines(ctx, cfg.n || 'Arquivo das Sombras', st)
    name.forEach((l, i) => ctx.fillText(l, cx, 290 + i * Math.round(st.title * 0.95)))
    ctx.fillStyle = C.soft
    ctx.font = `600 ${st.font}px ${BODY}`
    const phrase = cfg.p || ''
    if (phrase) ctx.fillText(phrase.length > 44 ? phrase.slice(0, 43) + '…' : phrase, cx, 300 + name.length * Math.round(st.title * 0.95))
    ornament(ctx, cx, 420, C.gold)
    ctx.textAlign = 'left'
    return
  }
  if (page.k === 'toc') {
    let y = M.top + st.title
    if (page.first) {
      ctx.fillStyle = C.ink
      ctx.font = `${st.title}px ${GOTHIC}`
      ctx.fillText('Índice', left, y)
      ctx.fillStyle = C.soft
      ctx.font = `600 ${st.font}px ${BODY}`
      y += st.line + 4
      ctx.fillText(`${page.count} ${page.count === 1 ? 'história guardada' : 'histórias guardadas'}`, left, y)
      y += st.line + 14
    } else y = M.top + st.line
    ctx.font = `600 ${st.font}px ${BODY}`
    if (!page.entries.length) {
      ctx.fillStyle = C.soft
      ctx.fillText('Nenhuma história ainda.', left, y)
    }
    for (const e of page.entries) {
      const num = String(e.page)
      const nw = ctx.measureText(num).width
      let title = e.title
      while (title.length > 1 && ctx.measureText(title).width > right - left - nw - 24) title = title.slice(0, -2) + '…'
      ctx.fillStyle = C.ink
      ctx.fillText(title, left, y)
      ctx.fillText(num, right - nw, y)
      hits.push({ y0: y - st.font - 4, y1: y + 8, page: e.page })
      // pontilhado até o número
      ctx.fillStyle = C.soft
      const from = left + ctx.measureText(title).width + 8
      for (let x = from; x < right - nw - 8; x += 8) ctx.fillRect(Math.round(x), y - 2, 2, 2)
      y += st.line + 8
    }
    pageNumber(ctx, index, st)
    return
  }
  // história
  let y = M.top
  if (page.first) {
    ctx.fillStyle = C.ink
    for (const l of titleLines(ctx, page.title, st)) {
      y += Math.round(st.title * 0.95)
      ctx.fillText(l, left, y)
    }
    ctx.font = `600 ${st.font}px ${BODY}`
    if (page.sub) {
      y += st.line + 4
      ctx.fillStyle = C.soft
      ctx.fillText(page.sub, left, y)
    }
    if (page.draft) {
      y += st.line
      ctx.fillStyle = C.wine
      ctx.fillText('rascunho', left, y)
    }
    y += 22
  } else {
    ctx.fillStyle = C.soft
    ctx.font = `600 ${Math.max(12, st.font - 3)}px ${BODY}`
    y += 14
    ctx.fillText(page.title, left, y)
    ctx.fillRect(left, y + 8, right - left, 2)
    y += 16
  }
  if (marked) ribbon(ctx, gutterLeft ? PW - 20 : 6)
  const body = `600 ${st.font}px ${BODY}`
  const base = (k: number) => y + (k + 1) * st.line - Math.round(st.line * 0.28)
  if (page.drop) {
    // letra capital: o alto acompanha as maiúsculas da primeira linha, a base senta na linha `lines`
    ctx.font = dropFont(ctx, st)
    ctx.fillStyle = C.wine
    ctx.fillText(page.drop.letter, left - 1, base(Math.min(page.drop.lines, page.lines.length) - 1))
  }
  ctx.fillStyle = C.ink
  ctx.font = body
  const space = ctx.measureText(' ').width
  page.lines.forEach((l, k) => {
    const by = base(k)
    if (l.center) {
      ornament(ctx, (left + right) / 2, by - Math.round(st.font * 0.35), C.gold)
      ctx.fillStyle = C.ink
      return
    }
    const words = l.t.split(' ')
    const avail = right - left - l.x
    const natural = textWidth(ctx, l.t)
    // justificado como num livro; só uma linha quase vazia fica alinhada à esquerda
    const extra = words.length > 1 ? (avail - natural) / (words.length - 1) : 0
    if (!l.justify || extra <= 0 || extra > space * 5) {
      drawText(ctx, l.t, left + l.x, by)
      return
    }
    let x = left + l.x
    for (const w of words) {
      drawText(ctx, w, Math.round(x), by)
      x += textWidth(ctx, w) + space + extra
    }
  })
  pageNumber(ctx, index, st)
}

/** Texturas das páginas, criadas sob demanda e guardadas (poucas de cada vez). */
export class PageTextures {
  private cache = new Map<number, THREE.CanvasTexture>()
  private hits = new Map<number, TocHit[]>()
  private marked = new Set<number>()
  private pages: BookPage[] = []
  private st: PageStyle
  private cfg: Config
  constructor(cfg: Config) {
    this.cfg = cfg
    this.st = pageStyle(cfg)
  }
  set(pages: BookPage[], cfg: Config) {
    this.pages = pages
    this.cfg = cfg
    this.st = pageStyle(cfg)
    this.cache.forEach((t) => t.dispose())
    this.cache.clear()
    this.hits.clear()
    // páginas marcadas: o original guarda o marcador relativo ao início da história
    this.marked.clear()
    const first = new Map<string, number>()
    pages.forEach((p, i) => p.k === 'story' && p.first && first.set(p.sid, i))
    for (const m of cfg.bm || []) {
      const f = first.get(m.sid)
      if (f !== undefined && pages[f + m.off]?.k === 'story') this.marked.add(f + m.off)
    }
  }
  /** Entrada do índice no ponto (x, y) da página, em pixels da textura. */
  tocAt(index: number, y: number) {
    this.get(index)
    return (this.hits.get(index) || []).find((h) => y >= h.y0 && y <= h.y1)?.page
  }
  get(index: number) {
    let t = this.cache.get(index)
    if (t) {
      // usada agora: vai para o fim da fila de descarte
      this.cache.delete(index)
      this.cache.set(index, t)
      return t
    }
    const c = document.createElement('canvas')
    c.width = PW
    c.height = PH
    const hits: TocHit[] = []
    drawPage(c.getContext('2d')!, index, this.pages[index], this.st, this.cfg, this.marked.has(index), hits)
    this.hits.set(index, hits)
    t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.NearestFilter
    t.anisotropy = 4
    this.cache.set(index, t)
    if (this.cache.size > 16) {
      const [k, old] = this.cache.entries().next().value!
      this.cache.delete(k)
      old.dispose()
    }
    return t
  }
}
