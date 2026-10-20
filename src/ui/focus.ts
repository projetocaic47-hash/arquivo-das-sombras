import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Janela por cima do quarto: o foco do teclado entra nela ao abrir, Tab circula só dentro
 * dela, Esc chama `onEscape`, e ao fechar o foco volta para onde estava (o botão que a abriu).
 */
export function useModal(ref: RefObject<HTMLElement | null>, onEscape?: () => void, first?: () => HTMLElement | null) {
  const esc = useRef(onEscape)
  esc.current = onEscape
  const pick = useRef(first)
  pick.current = first
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prev = document.activeElement as HTMLElement | null
    if (!el.contains(document.activeElement)) (pick.current?.() ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && esc.current) {
        e.preventDefault()
        e.stopPropagation()
        esc.current()
      } else if (e.key === 'Tab') {
        const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
        if (!all.length) return
        const a = all[0]
        const z = all[all.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    el.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('keydown', key)
      if (prev && prev !== document.body && prev.isConnected) prev.focus()
    }
  }, [ref])
}
