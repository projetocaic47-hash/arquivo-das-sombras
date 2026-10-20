import { lazy, Suspense, useState } from 'react'
import { DataPanel } from './ui/DataPanel'

// A cena 3D (three.js) é o maior pedaço do app; carregá-la à parte deixa a interface aparecer primeiro.
const SceneRoot = lazy(() => import('./scene/SceneRoot').then((m) => ({ default: m.SceneRoot })))

export function App() {
  const [ready, setReady] = useState(false)
  const [panel, setPanel] = useState(false)
  return (
    <>
      <Suspense fallback={null}>
        <SceneRoot onReady={() => setReady(true)} />
      </Suspense>
      <div className={'loading' + (ready ? ' done' : '')} aria-live="polite" data-ready={ready}>
        acendendo a vela…
      </div>
      <nav className="topbar">
        <button onClick={() => setPanel(true)}>Acervo</button>
      </nav>
      <p className="phase-tag">Fase 3 · protótipo do quarto</p>
      {panel && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Acervo" onKeyDown={(e) => e.key === 'Escape' && setPanel(false)}>
          <div className="sheet">
            <button className="close" onClick={() => setPanel(false)}>
              fechar
            </button>
            <DataPanel />
          </div>
        </div>
      )}
    </>
  )
}
