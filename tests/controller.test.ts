import { describe, expect, it } from 'vitest'
import { BookController } from '../src/book/controller'
import type { BookPage } from '../src/book/pages'

// 12 páginas = aberturas 1 a 6
const pages: BookPage[] = Array.from({ length: 12 }, () => ({ k: 'endpaper' }))
function make() {
  const b = new BookController()
  b.setPages(pages)
  return b
}
/** Roda as animações por `s` segundos a 60 quadros por segundo. */
const run = (b: BookController, s: number) => {
  for (let i = 0; i < s * 60; i++) b.update(1 / 60)
}

describe('controle do livro', () => {
  it('abre na primeira abertura e fecha ao voltar dela', () => {
    const b = make()
    expect(b.last).toBe(6)
    b.open()
    run(b, 2)
    expect(b.cover).toBe(1)
    expect(b.spread).toBe(1)
    b.step(-1)
    run(b, 2)
    expect(b.cover).toBe(0)
    expect(b.spread).toBe(0)
  })

  it('cliques rápidos durante a virada entram na fila e todos acontecem, em ordem', () => {
    const b = make()
    b.open()
    run(b, 2)
    b.step(1)
    b.step(1)
    b.step(1)
    b.step(-1)
    run(b, 0.3)
    expect(b.turn).not.toBeNull()
    run(b, 6)
    expect(b.spread).toBe(3)
    expect(b.turn).toBeNull()
    expect(b.queue).toEqual([])
  })

  it('não passa da última abertura', () => {
    const b = make()
    b.open()
    run(b, 2)
    for (let i = 0; i < 10; i++) {
      b.step(1)
      run(b, 2)
    }
    expect(b.spread).toBe(6)
  })

  it('arrastar e soltar antes da metade devolve a folha; depois da metade, vira', () => {
    const b = make()
    b.open()
    run(b, 2)
    expect(b.beginDrag(1)).toBe(true)
    b.dragTo(0.3)
    run(b, 0.5)
    expect(b.turn!.p).toBeGreaterThan(0.25)
    b.endDrag(0)
    run(b, 2)
    expect(b.spread).toBe(1)
    b.beginDrag(1)
    b.dragTo(0.65)
    run(b, 0.5)
    b.endDrag(0)
    run(b, 2)
    expect(b.spread).toBe(2)
  })

  it('um gesto rápido vira mesmo antes da metade', () => {
    const b = make()
    b.open()
    run(b, 2)
    b.beginDrag(1)
    b.dragTo(0.25)
    run(b, 0.5)
    b.endDrag(3)
    run(b, 2)
    expect(b.spread).toBe(2)
  })

  it('a folha anda sem saltos: nenhum quadro move mais que 1/30 da virada a 60 qps', () => {
    const b = make()
    b.open()
    run(b, 2)
    b.step(1)
    let prev = b.turn!.p
    while (b.turn) {
      b.update(1 / 60)
      const p = b.turn ? b.turn.p : 1
      expect(Math.abs(p - prev)).toBeLessThanOrEqual(1 / 30)
      prev = p
    }
  })

  it('fechar do meio do livro leva as folhas lidas junto e termina fechado', () => {
    const b = make()
    b.open()
    run(b, 2)
    b.step(1)
    b.step(1)
    run(b, 5)
    expect(b.spread).toBe(3)
    b.close()
    expect(b.closingFrom).toBe(3)
    run(b, 2)
    expect(b.spread).toBe(0)
    expect(b.closingFrom).toBe(0)
  })

  it('celular: uma página por vez, deslizando dentro da abertura e virando entre aberturas', () => {
    const b = make()
    b.setSingle(true)
    b.open()
    run(b, 2)
    expect([b.spread, b.side]).toEqual([1, 0])
    b.step(1)
    expect([b.spread, b.side, b.turn]).toEqual([1, 1, null])
    b.step(1)
    run(b, 2)
    expect([b.spread, b.side]).toEqual([2, 0])
    b.step(-1)
    run(b, 2)
    expect([b.spread, b.side]).toEqual([1, 1])
  })

  it('reduzir animações: as páginas trocam na hora', () => {
    const b = make()
    b.reducedMotion = true
    b.open()
    b.step(1)
    expect(b.spread).toBe(2)
    expect(b.turn).toBeNull()
  })

  it('vai até uma página distante abrindo o livro e virando as folhas uma a uma', () => {
    const b = make()
    const seen: number[] = []
    b.goToPage(9)
    for (let i = 0; i < 60 * 8; i++) {
      b.update(1 / 60)
      if (seen[seen.length - 1] !== b.spread) seen.push(b.spread)
    }
    expect(b.cover).toBe(1)
    expect(b.spread).toBe(5)
    expect(b.side).toBe(1)
    expect(b.jump).toBeNull()
    // passou por todas as aberturas, sem pular nenhuma
    expect(seen).toEqual([1, 2, 3, 4, 5])
  })

  it('volta para trás num salto e para se o leitor clicar no meio', () => {
    const b = make()
    b.goToPage(11)
    run(b, 8)
    expect(b.spread).toBe(6)
    b.goToPage(2)
    run(b, 0.2)
    b.step(1)
    run(b, 6)
    expect(b.jump).toBeNull()
    expect(b.spread).toBeGreaterThan(2)
  })
  it('tela cheia com uma página por vez: cada página vira como uma folha', () => {
    const b = make()
    b.setSingle(true)
    b.flat = true
    b.open()
    run(b, 2)
    expect(b.page).toBe(0)
    b.step(1)
    expect(b.turn?.page).toBe(true)
    expect(b.turn?.from).toBe(0)
    run(b, 2)
    expect([b.page, b.spread, b.side, b.turn]).toEqual([1, 1, 1, null])
    b.step(1)
    run(b, 2)
    expect([b.page, b.spread, b.side]).toEqual([2, 2, 0])
    b.step(-1)
    expect(b.turn?.p).toBe(1)
    run(b, 2)
    expect(b.page).toBe(1)
  })

  it('tela cheia: um salto longo vai direto para perto e vira só a última página', () => {
    const b = make()
    b.setSingle(true)
    b.flat = true
    b.open()
    run(b, 2)
    const seen: number[] = []
    b.goToPage(9)
    for (let i = 0; i < 60 * 3; i++) {
      b.update(1 / 60)
      if (seen[seen.length - 1] !== b.page) seen.push(b.page)
    }
    expect(b.page).toBe(9)
    expect(b.jump).toBeNull()
    expect(seen).toEqual([8, 9])
  })

  it('tela cheia: arrastar a página até o meio e soltar desiste da virada', () => {
    const b = make()
    b.setSingle(true)
    b.flat = true
    b.open()
    run(b, 2)
    expect(b.beginDrag(1)).toBe(true)
    b.dragTo(0.3)
    run(b, 0.5)
    b.endDrag(0)
    run(b, 2)
    expect([b.page, b.turn]).toEqual([0, null])
  })
})
