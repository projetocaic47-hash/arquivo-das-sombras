// Formatação do texto ao entrar no livro, como num livro impresso: parágrafos com recuo
// em vez de linhas em branco, travessão nos diálogos, aspas curvas, reticências, letra
// capital no começo da história e linhas justificadas. Só muda a forma de aparecer no
// livro: o texto guardado no acervo continua exatamente como foi escrito.

export type Block = { k: 'p'; text: string } | { k: 'break' }

/** Linha de pausa de cena: ***, * * *, ---, ~~~, # ou ⁂ sozinhos na linha. */
const SCENE_BREAK = /^(?:(?:\*\s*){3,}|-{3,}|~{3,}|#|⁂)$/

/** Ajusta a pontuação de um parágrafo. */
export function typography(line: string): string {
  let s = line.replace(/[ \t ]+/g, ' ').trim()
  // diálogo: hífen ou travessão curto no começo vira travessão
  s = s.replace(/^(?:--?|–|—)\s*/, (m) => (m.trim() ? '— ' : m))
  // travessões no meio da frase
  s = s.replace(/\s+(?:--|–|-)\s+/g, ' — ').replace(/--/g, '—')
  // reticências
  s = s.replace(/\.\s?\.\s?\./g, '…')
  // aspas retas viram curvas: abrem no começo ou depois de espaço, travessão ou parêntese
  s = s.replace(/(^|[\s([{—])"/g, '$1“').replace(/"/g, '”')
  s = s.replace(/(^|[\s([{—])'(?=\S)/g, '$1‘').replace(/'/g, '’')
  // sem espaço antes da pontuação nem depois de abrir parêntese ou aspas
  s = s.replace(/\s+([,.;:!?…)\]”’])/g, '$1').replace(/([([“‘])\s+/g, '$1')
  // parágrafo começa com maiúscula (depois do travessão ou das aspas, se houver)
  s = s.replace(/^([—“‘(\s]*)(\p{Ll})/u, (_, pre: string, c: string) => pre + c.toLocaleUpperCase('pt-BR'))
  return s
}

/** Divide o texto em parágrafos e pausas de cena. Linhas em branco não viram espaço. */
export function formatText(raw: string): Block[] {
  const out: Block[] = []
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (SCENE_BREAK.test(t)) {
      // pausa só entre parágrafos, nunca repetida nem no começo
      if (out.length && out[out.length - 1].k !== 'break') out.push({ k: 'break' })
      continue
    }
    out.push({ k: 'p', text: typography(t) })
  }
  while (out.length && out[out.length - 1].k === 'break') out.pop()
  return out
}

/** Linha pronta para desenhar. */
export interface Line {
  t: string
  /** recuo à esquerda (unidades de `measure`) */
  x: number
  /** espalha as palavras até a margem direita (todas as linhas do parágrafo menos a última) */
  justify?: boolean
  /** ornamento centralizado de pausa de cena */
  center?: boolean
}

export interface DropCap {
  letter: string
  /** quantas linhas a letra capital ocupa */
  lines: number
}

export interface SetMetrics {
  width: number
  /** recuo da primeira linha dos parágrafos */
  indent: number
  measure(text: string): number
  /** largura ocupada pela letra capital, com o respiro até o texto */
  dropWidth(letter: string): number
}

export const DROP_LINES = 3

/** Quebra uma palavra maior que a linha em pedaços que cabem. */
function splitLong(w: string, width: number, measure: (t: string) => number) {
  const parts: string[] = []
  while (measure(w) > width && w.length > 1) {
    let n = w.length - 1
    while (n > 1 && measure(w.slice(0, n)) > width) n--
    parts.push(w.slice(0, n))
    w = w.slice(n)
  }
  parts.push(w)
  return parts
}

/**
 * Compõe as linhas da história: letra capital no primeiro parágrafo (com o resto da
 * primeira palavra em maiúsculas), recuo nos demais, pausas de cena com ornamento.
 */
export function setStory(raw: string, m: SetMetrics): { lines: Line[]; drop?: DropCap } {
  const blocks = formatText(raw)
  const lines: Line[] = []
  let drop: DropCap | undefined
  let dropLeft = 0
  let dropW = 0
  let afterBreak = true
  for (const b of blocks) {
    if (b.k === 'break') {
      lines.push({ t: '⁂', x: 0, center: true })
      afterBreak = true
      continue
    }
    let text = b.text
    let indent = afterBreak ? 0 : m.indent
    if (!drop && !lines.length) {
      // letra capital: a primeira letra do texto; a pontuação de abertura fica de fora
      const mt = /^[—“‘(\s]*(\p{L}|\p{N})(\S*)\s*(.*)$/u.exec(text)
      if (mt) {
        drop = { letter: mt[1].toLocaleUpperCase('pt-BR'), lines: DROP_LINES }
        dropW = m.dropWidth(drop.letter)
        dropLeft = DROP_LINES
        text = (mt[2].toLocaleUpperCase('pt-BR') + (mt[3] ? ' ' + mt[3] : '')).trim()
        indent = 0
      }
    }
    afterBreak = false
    const words = text.split(' ').filter(Boolean)
    const start = lines.length
    let line = ''
    let x = indent
    const room = () => m.width - (dropLeft > 0 ? dropW : 0) - x
    const lineX = () => (dropLeft > 0 ? dropW : 0) + x
    const push = () => {
      lines.push({ t: line, x: lineX(), justify: true })
      if (dropLeft > 0) dropLeft--
      line = ''
      x = 0
    }
    for (const word of words) {
      for (const w of splitLong(word, m.width - (dropLeft > 0 ? dropW : 0), m.measure)) {
        const next = line ? line + ' ' + w : w
        if (line && m.measure(next) > room()) {
          push()
          line = w
        } else line = next
      }
    }
    // a primeira palavra pode ficar sozinha ao lado da capital mesmo se o parágrafo for vazio
    if (line || lines.length === start) push()
    lines[lines.length - 1].justify = false
  }
  return { lines, drop }
}
