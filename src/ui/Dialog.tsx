import { useEffect, useRef, type ReactNode } from 'react'
import { sfx } from '../audio/sfx'
import { useModal } from './focus'

export interface Choice {
  label: string
  value: number
}

/**
 * Pergunta com botões, equivalente à função ask() do original. A última escolha é sempre
 * a que não muda nada (Manter, Cancelar): ela recebe o foco e é a resposta do Esc.
 */
export function Dialog({ children, choices, onChoose }: { children: ReactNode; choices: string[]; onChoose: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const safe = useRef<HTMLButtonElement>(null)
  const choose = (i: number) => {
    if (i === choices.length - 1) sfx('dialog.cancel')
    onChoose(i)
  }
  useEffect(() => sfx('dialog.open'), [])
  useModal(box, () => choose(choices.length - 1), () => safe.current)
  return (
    <div className="overlay" role="dialog" aria-modal="true" ref={box}>
      <div className="modal">
        <div className="modal-body">{children}</div>
        <div className="row">
          {choices.map((c, i) => (
            <button key={c} ref={i === choices.length - 1 ? safe : undefined} onClick={() => choose(i)}>
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
