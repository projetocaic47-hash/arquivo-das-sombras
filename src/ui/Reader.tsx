import { formatText } from '../book/typeset'
import type { Story } from '../data/types'

/**
 * Leitura simples, para quando o navegador não desenha o quarto 3D: a história com a
 * mesma diagramação do livro (letra capital, recuo, travessão, pausas de cena).
 */
export function Reader({ story, onEdit, onClose }: { story: Story; onEdit: () => void; onClose: () => void }) {
  const blocks = formatText(story.x || '')
  return (
    <section className="panel reader" aria-label={'Leitura: ' + (story.t || 'Sem título')}>
      <h3>{story.t || 'Sem título'}</h3>
      {story.sub && <p className="reader-sub">{story.sub}</p>}
      <div className="reader-text">
        {blocks.length ? (
          blocks.map((b, i) =>
            b.k === 'break' ? (
              <p key={i} className="scene-break" aria-label="pausa de cena">
                ⁂
              </p>
            ) : (
              <p key={i}>{b.text}</p>
            ),
          )
        ) : (
          <p className="small">Esta história ainda não tem texto.</p>
        )}
      </div>
      <div className="row">
        <button onClick={onEdit}>editar</button>
        <button onClick={onClose}>fechar</button>
      </div>
    </section>
  )
}
