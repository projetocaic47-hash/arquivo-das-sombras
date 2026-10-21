import { lastSpread, type BookPage } from './pages'

// Estado do livro e das suas animações, separado da cena 3D e da interface.
// A cena lê os valores animados a cada quadro; a interface assina as mudanças
// discretas (abertura atual, livro aberto, páginas) com useSyncExternalStore.

export const TURN_SECONDS = 1.15
export const COVER_SECONDS = 1.35

export interface Turn {
  /** abertura de onde a folha sai (a folha `from` vira para avançar; `from − 1` para voltar) */
  from: number
  dir: 1 | -1
  /** 0 = folha deitada à direita, 1 = deitada à esquerda, sempre nesse sentido */
  p: number
  /** arrastando com o dedo ou o mouse: o progresso segue o ponteiro */
  drag: boolean
  /** alvo do arraste (o progresso persegue este valor com suavização) */
  target: number
  /** ao soltar: 1 conclui a virada, 0 desiste */
  settle?: 0 | 1
  /** página focada antes da virada (modo de uma página), para voltar a ela se a virada desistir */
  side0: 0 | 1
  /** leitura em tela cheia com uma página por vez: a folha é a própria página `from` (avançar)
   * ou `from − 1` (voltar), e o fim da virada mostra a página `from + dir` */
  page?: boolean
  /** a virada começou num arraste (ao assentar, a folha "pousa") */
  dragged?: boolean
}

/** Momentos do livro que têm som (o app liga isto ao motor de efeitos). */
export type BookSound = 'open' | 'close' | 'thud' | 'turn' | 'flick' | 'lift' | 'land'

export interface BookSnapshot {
  pages: BookPage[]
  spread: number
  last: number
  /** o livro está aberto ou abrindo (modo de leitura) */
  reading: boolean
  turning: boolean
  /** tela estreita: uma página por vez, como o original abaixo de 900 px */
  single: boolean
  /** página da abertura em foco no modo de uma página: 0 esquerda, 1 direita */
  side: 0 | 1
}

type Listener = () => void

export class BookController {
  pages: BookPage[] = []
  /** abertura atual, já concluída (0 = fechado) */
  spread = 0
  /** capa: 0 fechada, 1 aberta; `coverTarget` é para onde ela vai */
  cover = 0
  coverTarget = 0
  /** ao fechar a partir do meio do livro, quantas folhas vão junto com a capa */
  closingFrom = 0
  turn: Turn | null = null
  queue: (1 | -1)[] = []
  /** destino de um salto (índice, "continuar leitura"): as folhas viram depressa até lá */
  jump: { spread: number; side: 0 | 1 } | null = null
  reducedMotion = false
  single = false
  /** a leitura em tela cheia está à vista: ela anima o livro e, com uma página por vez, cada página vira */
  flat = false
  side: 0 | 1 = 0
  /** avisado nos momentos com som; não interfere na animação */
  sound: (s: BookSound) => void = () => {}
  private listeners = new Set<Listener>()
  private snap: BookSnapshot = { pages: [], spread: 0, last: 1, reading: false, turning: false, single: false, side: 0 }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.snap
  private emit() {
    const reading = this.coverTarget === 1
    const turning = !!this.turn || this.cover !== this.coverTarget
    const s = this.snap
    if (s.pages === this.pages && s.spread === this.spread && s.reading === reading && s.turning === turning && s.single === this.single && s.side === this.side) return
    this.snap = { pages: this.pages, spread: this.spread, last: this.last, reading, turning, single: this.single, side: this.side }
    this.listeners.forEach((l) => l())
  }

  get last() {
    return lastSpread(this.pages.length)
  }

  /** página em foco com uma página por vez */
  get page() {
    return Math.max(0, 2 * this.spread - 2 + this.side)
  }

  private setPage(i: number) {
    this.spread = Math.floor(i / 2) + 1
    this.side = (i % 2) as 0 | 1
  }

  /** cada página vira sozinha (tela cheia, uma página por vez) */
  private get pageTurns() {
    return this.flat && this.single
  }

  setPages(pages: BookPage[]) {
    this.pages = pages
    // se o acervo encolheu, a abertura atual não pode passar da última
    if (this.spread > this.last) this.spread = this.last
    this.emit()
  }

  setSingle(single: boolean) {
    this.single = single
    this.emit()
  }

  open() {
    if (this.coverTarget === 1) return
    this.coverTarget = 1
    this.closingFrom = 0
    this.sound('open')
    this.side = 0
    if (this.reducedMotion) this.cover = 1
    if (this.spread === 0) this.spread = 1
    this.emit()
  }

  /**
   * Vai até a página `page`, abrindo o livro se preciso. Perto, vira normalmente;
   * longe, as folhas passam em sequência cada vez mais rápida, sem saltar.
   */
  goToPage(page: number) {
    if (page < 0 || !this.pages.length) return
    const spread = Math.min(this.last, Math.floor(page / 2) + 1)
    const side: 0 | 1 = page % 2 === 0 ? 0 : 1
    this.queue = []
    if (this.reducedMotion) {
      if (this.coverTarget === 0) this.open()
      this.turn = null
      this.spread = spread
      this.side = side
      this.emit()
      return
    }
    this.jump = { spread, side }
    if (this.coverTarget === 0) this.open()
    else if (!this.turn && this.cover === 1) this.drainQueue()
  }

  close() {
    if (this.coverTarget === 0) return
    this.turn = null
    this.queue = []
    this.jump = null
    this.closingFrom = this.spread
    this.coverTarget = 0
    this.sound('close')
    if (this.reducedMotion) this.finishClose(true)
    this.emit()
  }

  private finishClose(quiet = false) {
    if (!quiet) this.sound('thud')
    this.cover = 0
    this.spread = 0
    this.closingFrom = 0
  }

  /** Avança (1) ou volta (−1) uma abertura; cliques durante uma virada entram na fila. */
  step(dir: 1 | -1) {
    // um clique do leitor no meio de um salto: o salto para na folha que está virando
    this.jump = null
    if (this.coverTarget === 0) {
      if (dir === 1) this.open()
      return
    }
    if (this.turn || this.cover !== 1) {
      if (this.queue.length < 3) this.queue.push(dir)
      return
    }
    // uma página por vez: dentro da mesma abertura a câmera só desliza para a outra página
    if (this.pageTurns) {
      this.startTurn(dir)
      return
    }
    if (this.single && dir === 1 && this.side === 0) {
      this.side = 1
      this.emit()
      return
    }
    if (this.single && dir === -1 && this.side === 1) {
      this.side = 0
      this.emit()
      return
    }
    this.startTurn(dir)
  }

  private canTurn(dir: 1 | -1) {
    return dir === 1 ? this.spread < this.last : this.spread > 1
  }

  private startTurn(dir: 1 | -1, drag = false) {
    if (this.pageTurns) {
      const from = this.page
      const to = from + dir
      if (to < 0 || to >= this.pages.length) {
        if (dir === -1 && !drag) this.close()
        return false
      }
      if (!drag) this.sound(this.jump ? 'flick' : 'turn')
      if (this.reducedMotion && !drag) {
        this.setPage(to)
        this.emit()
        return true
      }
      const p = dir === 1 ? 0 : 1
      this.turn = { from, dir, p, drag, target: p, side0: this.side, page: true, dragged: drag }
      this.emit()
      return true
    }
    if (!this.canTurn(dir)) {
      // voltar da primeira abertura fecha o livro, como a capa do original
      if (dir === -1 && this.spread === 1 && !drag) this.close()
      return false
    }
    const side0 = this.side
    // a página que aparece depois da virada: a da esquerda ao avançar, a da direita ao voltar
    this.side = dir === 1 ? 0 : 1
    if (!drag) this.sound(this.jump ? 'flick' : 'turn')
    if (this.reducedMotion && !drag) {
      this.spread += dir
      this.emit()
      return true
    }
    const p = dir === 1 ? 0 : 1
    this.turn = { from: this.spread, dir, p, drag, target: p, side0, dragged: drag }
    this.emit()
    return true
  }

  /** Começa a arrastar uma folha; devolve falso se não há folha para esse lado. */
  beginDrag(dir: 1 | -1) {
    if (this.turn || this.cover !== 1 || this.coverTarget !== 1) return false
    const ok = this.startTurn(dir, true)
    if (ok) this.sound('lift')
    return ok
  }

  dragTo(p: number) {
    if (this.turn?.drag) this.turn.target = Math.min(1, Math.max(0, p))
  }

  /** Solta a folha: conclui se passou da metade ou se foi lançada com força. */
  endDrag(velocity: number) {
    const t = this.turn
    if (!t?.drag) return
    t.drag = false
    const toward = t.dir === 1 ? t.p + velocity * 0.25 > 0.5 : t.p + velocity * 0.25 < 0.5
    // 1 = a folha termina do lado para onde ia; 0 = volta ao lugar
    t.settle = toward ? 1 : 0
  }

  /** Avança as animações; chamado pela cena a cada quadro. */
  update(dt: number) {
    dt = Math.min(dt, 1 / 20)
    // capa
    if (this.cover !== this.coverTarget) {
      const d = dt / COVER_SECONDS
      this.cover = this.coverTarget > this.cover ? Math.min(1, this.cover + d) : Math.max(0, this.cover - d)
      if (this.cover === 0 && this.coverTarget === 0) this.finishClose()
      if (this.cover === this.coverTarget) {
        this.emit()
        this.drainQueue()
      }
    }
    const t = this.turn
    if (!t) return
    if (t.drag) {
      // o papel acompanha o ponteiro com um pequeno atraso, sem saltos
      t.p += (t.target - t.p) * (1 - Math.exp(-dt * 14))
      return
    }
    const end = t.settle === 0 ? (t.dir === 1 ? 0 : 1) : t.dir === 1 ? 1 : 0
    const far = this.jump ? (t.page ? Math.abs(2 * this.jump.spread - 2 + this.jump.side - this.page) / 2 : Math.abs(this.jump.spread - this.spread)) : 0
    const speed = (far ? Math.min(8, Math.max(1.7, far * 0.9)) : this.queue.length ? 1.7 : 1) / TURN_SECONDS
    t.p = end > t.p ? Math.min(end, t.p + dt * speed) : Math.max(end, t.p - dt * speed)
    if (t.p === end) {
      if (t.page) {
        if (t.settle !== 0) this.setPage(t.from + t.dir)
      } else if (t.settle !== 0) this.spread = t.from + t.dir
      else this.side = t.side0
      this.turn = null
      if (t.dragged) this.sound('land')
      this.emit()
      this.drainQueue()
    }
  }

  private drainQueue() {
    const j = this.jump
    if (j && this.pageTurns) {
      const target = 2 * j.spread - 2 + j.side
      // em tela cheia, um salto longo vai direto para perto do destino e vira só a última folha
      if (Math.abs(target - this.page) > 2) this.setPage(target - Math.sign(target - this.page))
      if (target === this.page) this.jump = null
      else if (!this.startTurn(target > this.page ? 1 : -1)) this.jump = null
      return
    }
    if (j && this.flat && Math.abs(j.spread - this.spread) > 2) this.spread = j.spread - Math.sign(j.spread - this.spread)
    if (j) {
      if (j.spread === this.spread) {
        this.jump = null
        if (this.side !== j.side) {
          this.side = j.side
          this.emit()
        }
        return
      }
      if (!this.startTurn(j.spread > this.spread ? 1 : -1)) this.jump = null
      return
    }
    const next = this.queue.shift()
    if (next) this.step(next)
  }
}

/** O livro da aplicação (um só). */
export const book = new BookController()
