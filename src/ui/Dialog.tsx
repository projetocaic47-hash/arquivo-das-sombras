import { useEffect, useRef, type ReactNode } from 'react'

export interface Choice {
  label: string
  value: number
}

/** Pergunta com botões, equivalente à função ask() do original. */
export function Dialog({ children, choices, onChoose }: { children: ReactNode; choices: string[]; onChoose: (i: number) => void }) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-body">{children}</div>
        <div className="row">
          {choices.map((c, i) => (
            <button key={c} ref={i === 0 ? first : undefined} onClick={() => onChoose(i)}>
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
