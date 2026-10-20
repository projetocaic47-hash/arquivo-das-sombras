import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { book } from './book/controller'
import { useArchive } from './state/useArchive'
import { DataPanel } from './ui/DataPanel'

// A cena 3D (three.js) é o maior pedaço do app; carregá-la à parte deixa a interface aparecer primeiro.
const SceneRoot = lazy(() => import('./scene/SceneRoot').then((m) => ({ default: m.SceneRoot })))

/** Páginas à vista, como o original mostra ("3 – 4 / 12"); no celular, uma página só. */
function position(spread: number, total: number, single: boolean, side: 0 | 1) {
  const l = 2 * spread - 2
  if (single) return l + side === 0 ? `folha de rosto / ${total}` : `${Math.min(l + side, total)} / ${total}`
  if (spread <= 1) return `1 / ${total}`
  const r = Math.min(l + 1, total)
  return `${l}${r > l ? ' – ' + r : ''} / ${total}`
}

/** Telas estreitas ou em pé mostram uma página por vez (o original usa 900 px como limite). */
const isSingle = () => innerWidth < 900 && innerWidth / innerHeight < 1.2

export function App() {
  const archive = useArchive()
  const [ready, setReady] = useState(false)
  const [panel, setPanel] = useState(false)
  const bk = useSyncExternalStore(book.subscribe, book.getSnapshot)

  useEffect(() => {
    const on = () => book.setSingle(isSingle())
    on()
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])

  // setas viram as páginas e Esc fecha o livro (fora dos painéis)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (panel || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') book.step(1)
      else if (e.key === 'ArrowLeft') book.step(-1)
      else if (e.key === 'Escape') book.close()
      else return
      e.preventDefault()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [panel])

  return (
    <>
      <Suspense fallback={null}>
        <SceneRoot onReady={() => setReady(true)} stories={archive.stories} config={archive.config} />
      </Suspense>
      <div className={'loading' + (ready ? ' done' : '')} aria-live="polite" data-ready={ready}>
        acendendo a vela…
      </div>
      <nav className="topbar">
        <button onClick={() => setPanel(true)}>Acervo</button>
      </nav>
      {ready && !bk.reading && (
        <div className="bookbar">
          <button onClick={() => book.open()}>Abrir o livro</button>
        </div>
      )}
      {bk.reading && (
        <div className="bookbar" data-testid="bookbar">
          <button aria-label="Página anterior" onClick={() => book.step(-1)}>
            ‹
          </button>
          <span className="pos" data-testid="pos">
            {position(bk.spread, Math.max(0, bk.pages.length - 1), bk.single, bk.side)}
          </span>
          <button aria-label="Próxima página" onClick={() => book.step(1)} disabled={bk.spread >= bk.last && !bk.turning && (!bk.single || bk.side === 1)}>
            ›
          </button>
          <button onClick={() => book.close()}>Fechar</button>
        </div>
      )}
      <p className="phase-tag">Fase 4 · livro · estilo pixel</p>
      {panel && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Acervo" onKeyDown={(e) => e.key === 'Escape' && setPanel(false)}>
          <div className="sheet">
            <button className="close" onClick={() => setPanel(false)}>
              fechar
            </button>
            <DataPanel archive={archive} />
          </div>
        </div>
      )}
    </>
  )
}
