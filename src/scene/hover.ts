import type { ThreeEvent } from '@react-three/fiber'
import { useSyncExternalStore } from 'react'

// Sem three.js aqui: o App importa clearHover, e este arquivo vai no pacote da primeira tela
// (a porta). O material do contorno fica em outline.ts, que só a cena 3D carrega.

// Objeto da mesa sob o mouse: só ele ganha o contorno dourado e a mãozinha.
let current: string | null = null
const subs = new Set<() => void>()
const set = (id: string | null) => {
  if (current === id) return
  current = id
  document.body.style.cursor = id ? 'pointer' : ''
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

/** O objeto `id` está sob o mouse? */
export function useHovered(id: string) {
  return useSyncExternalStore(subscribe, () => current === id)
}

/** Eventos para um objeto clicável da cena: contorno ao passar o mouse e a ação no clique. */
export function clickable(id: string, action: () => void) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      action()
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      set(id)
    },
    onPointerOut: () => current === id && set(null),
  }
}

/** Some com o contorno (por exemplo, ao abrir o livro ou uma janela por cima). */
export const clearHover = () => set(null)

// ?debug: os testes visuais acendem o contorno sem precisar mirar o mouse
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) (window as unknown as { __hover: typeof set }).__hover = set
