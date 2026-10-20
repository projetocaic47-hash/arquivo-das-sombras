import { lazy, Suspense } from 'react'
import { DataPanel } from './ui/DataPanel'

// A cena 3D (three.js) é o maior pedaço do app; carregá-la à parte deixa os dados aparecerem primeiro.
const SceneRoot = lazy(() => import('./scene/SceneRoot').then((m) => ({ default: m.SceneRoot })))

export function App() {
  return (
    <>
      <Suspense fallback={null}>
        <SceneRoot />
      </Suspense>
      <DataPanel />
    </>
  )
}
