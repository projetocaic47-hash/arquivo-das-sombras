import { describe, expect, it } from 'vitest'
import { formatText, setStory, typography, type SetMetrics } from '../src/book/typeset'

const m: SetMetrics = { width: 20, indent: 2, measure: (t) => t.length, dropWidth: () => 4 }

describe('formatação do texto para o livro', () => {
  it('ajusta a pontuação como num livro impresso', () => {
    expect(typography('- quem está aí?')).toBe('— Quem está aí?')
    expect(typography('-- Ninguém -- disse ela.')).toBe('— Ninguém — disse ela.')
    expect(typography('ela disse "volte"... e saiu .')).toBe('Ela disse “volte”… e saiu.')
    expect(typography("d'água e 'aspas'")).toBe('D’água e ‘aspas’')
    expect(typography('  muitos    espaços  ,  aqui ( dentro )')).toBe('Muitos espaços, aqui (dentro)')
    expect(typography('“ótimo”, pensou.')).toBe('“Ótimo”, pensou.')
    // palavras com hífen continuam com hífen
    expect(typography('guarda-chuva bem-te-vi')).toBe('Guarda-chuva bem-te-vi')
  })

  it('linhas em branco não viram espaço; *** vira pausa de cena', () => {
    expect(formatText('um\n\n\ndois\n***\n\ntrês\n* * *\n')).toEqual([
      { k: 'p', text: 'Um' },
      { k: 'p', text: 'Dois' },
      { k: 'break' },
      { k: 'p', text: 'Três' },
    ])
    expect(formatText('***\num')).toEqual([{ k: 'p', text: 'Um' }])
  })

  it('letra capital no começo, resto da palavra em maiúsculas e recuo nos parágrafos seguintes', () => {
    const { lines, drop } = setStory('era uma vez uma casa muito antiga perto do rio\nela ficou', m)
    expect(drop).toEqual({ letter: 'E', lines: 3 })
    // as três primeiras linhas ficam à direita da capital
    expect(lines.slice(0, 3).every((l) => l.x === 4)).toBe(true)
    expect(lines[0].t.startsWith('RA uma')).toBe(true)
    expect(lines.every((l) => l.t.length + l.x <= 20)).toBe(true)
    const second = lines.findIndex((l) => l.t.startsWith('Ela'))
    // o segundo parágrafo ainda está ao lado da capital ou com recuo normal
    expect(lines[second].x === 4 + 2 || lines[second].x === 2).toBe(true)
    // a última linha de cada parágrafo não é justificada
    expect(lines[second - 1].justify).toBe(false)
    expect(lines[lines.length - 1].justify).toBe(false)
  })

  it('diálogo no começo: a capital é a primeira letra e o travessão sai', () => {
    const { lines, drop } = setStory('- quem bate?', m)
    expect(drop?.letter).toBe('Q')
    expect(lines[0].t).toBe('UEM bate?')
  })

  it('texto vazio não quebra nada', () => {
    expect(setStory('', m)).toEqual({ lines: [], drop: undefined })
  })
})
