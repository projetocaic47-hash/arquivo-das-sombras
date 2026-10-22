import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { blankStory, dateBR, isEmpty, nextOrder, parseTags, pushVersion, withVersion, words } from '../data/stories'
import type { Story, StoryStatus } from '../data/types'
import type { Archive } from '../state/useArchive'
import { useModal } from './focus'
import { sfx } from '../audio/sfx'
import { sameContent } from '../data/sync'
import { cloudLabel } from './cloudLabel'

// Editor de uma história, com as regras do original: grava sozinho 0,7 s depois de
// cada mudança (e ao fechar, e com Ctrl+S), guarda versões anteriores a cada 10 minutos
// de edição (até 15), modo foco, e os botões que levam a folha à mesa ou ao livro.
// A linha de estado só diz "salvo na nuvem" depois que a nuvem confirma. Se a mesma
// história mudar em outro aparelho com o editor aberto, nada é sobrescrito: sem edição
// pendente aqui, o editor mostra a versão nova; com edição pendente, a daqui vira uma
// cópia "(cópia em conflito)" e a de lá fica na história.

export type EditorExit = { to: 'stay' } | { to: 'book'; id: string } | { to: 'desk' }

interface Fields {
  t: string
  sub: string
  x: string
  tags: string
  st: StoryStatus
  note: string
}

const fieldsOf = (s: Story): Fields => ({ t: s.t, sub: s.sub || '', x: s.x, tags: (s.tags || []).join(', '), st: s.st, note: s.note || '' })

const sameAs = (s: Story, f: Fields) =>
  s.t === f.t && (s.sub || '') === f.sub && s.x === f.x && (s.tags || []).join(', ') === parseTags(f.tags).join(', ') && s.st === f.st && (s.note || '') === f.note

export function Editor({ archive, story, onExit }: { archive: Archive; story: Story | null; onExit: (e: EditorExit) => void }) {
  // a folha nova ganha id e data de criação agora, mas só é gravada quando tiver algo escrito
  const fresh = useRef(story ?? blankStory())
  const saved = useRef<Story | null>(story)
  const [f, setF] = useState<Fields>(() => fieldsOf(fresh.current))
  const fRef = useRef(f)
  fRef.current = f
  const [status, setStatus] = useState('—')
  const [focus, setFocus] = useState(false)
  const [versions, setVersions] = useState(false)
  const timer = useRef(0)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const text = useRef<HTMLTextAreaElement>(null)

  /** Grava o que está na tela (na fila: duas gravações nunca se cruzam). */
  const flush = useCallback((patch?: Partial<Fields>) => {
    clearTimeout(timer.current)
    timer.current = 0
    if (patch) {
      fRef.current = { ...fRef.current, ...patch }
      setF(fRef.current)
    }
    const run = async (): Promise<Story | null> => {
      const cur = fRef.current
      const prev = saved.current
      if (!prev && isEmpty(cur)) return null
      if (prev && sameAs(prev, cur)) return prev
      const now = Date.now()
      const base: Story = prev ?? { ...fresh.current, o: nextOrder(archive.stories) }
      const next: Story = { ...base, t: cur.t, sub: cur.sub, x: cur.x, tags: parseTags(cur.tags), st: cur.st, note: cur.note, u: now }
      if (prev) {
        const v = withVersion(prev, cur.x, now)
        if (v) next.v = v
      }
      setStatus('salvando…')
      try {
        await archive.saveStories([next])
        saved.current = next
        setStatus('guardado ✓')
        return next
      } catch (e) {
        setStatus('ERRO ao salvar')
        throw new Error(`Erro ao salvar: ${(e as Error).message}. Seu texto continua na tela; copie-o.`)
      }
    }
    const p = chain.current.then(run, run)
    chain.current = p.catch(() => {})
    return p
  }, [archive])

  const change = (patch: Partial<Fields>) => {
    fRef.current = { ...fRef.current, ...patch }
    setF(fRef.current)
    setStatus('pendente…')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => flush().catch(() => {}), 700)
  }

  // outra versão desta história chegou da nuvem (outro aparelho) com o editor aberto
  useEffect(() => {
    const cur = saved.current
    if (!cur) return
    const there = archive.stories.find((s) => s.id === cur.id)
    if (!there || there === cur || (there.u === cur.u && sameContent(there, cur))) return
    if (sameContent(there, cur)) {
      saved.current = there
      return
    }
    const pending = !sameAs(cur, fRef.current) || !!timer.current
    if (!pending) {
      saved.current = there
      fRef.current = fieldsOf(there)
      setF(fRef.current)
      setStatus('atualizada com a versão de outro aparelho')
      return
    }
    // edição daqui ainda não gravada: vira uma cópia, e a história fica com a versão de lá
    clearTimeout(timer.current)
    timer.current = 0
    const now = Date.now()
    const mine = fRef.current
    const copy: Story = {
      ...blankStory(now),
      t: `${mine.t || 'Sem título'} (cópia em conflito)`,
      sub: mine.sub,
      x: mine.x,
      tags: parseTags(mine.tags),
      st: mine.st,
      note: mine.note,
      o: nextOrder(archive.stories),
    }
    saved.current = copy
    fRef.current = fieldsOf(copy)
    setF(fRef.current)
    setStatus('salvando…')
    archive.saveStories([copy]).then(
      () => setStatus('guardado'),
      (e: Error) => setStatus('ERRO ao salvar: ' + e.message),
    )
    setError('Esta história foi alterada em outro aparelho enquanto você escrevia. Nada foi perdido: a versão de lá ficou na história, e o seu texto continua aqui como uma cópia "(cópia em conflito)".')
  }, [archive])

  // Ctrl+S grava na hora; ao sair da página, grava o que faltar
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        flush().catch(() => {})
      }
    }
    const leave = () => void flush().catch(() => {})
    addEventListener('keydown', key)
    addEventListener('beforeunload', leave)
    return () => {
      removeEventListener('keydown', key)
      removeEventListener('beforeunload', leave)
    }
  }, [flush])

  useEffect(() => {
    text.current?.focus()
  }, [])

  const [error, setError] = useState('')
  const exit = (patch: Partial<Fields> | undefined, after: (s: Story | null) => EditorExit) =>
    flush(patch).then(
      (s) => onExit(after(s)),
      (e: Error) => setError(e.message),
    )

  const restoreVersion = (i: number) => {
    const list = (saved.current?.v || []).slice().reverse()
    const v = list[i]
    if (!v || !saved.current) return
    // o texto atual vira uma versão também: nada se perde
    saved.current = { ...saved.current, v: pushVersion(saved.current.v, fRef.current.t, fRef.current.x) }
    setVersions(false)
    change({ t: v.t, x: v.x })
  }

  // Esc: sai do modo foco; fora dele, grava e fecha (como o botão "fechar")
  const box = useRef<HTMLDivElement>(null)
  useModal(box, () => (focus ? setFocus(false) : exit(undefined, () => ({ to: 'stay' }))), () => text.current)
  const versionsBox = useRef<HTMLDivElement>(null)

  const edited = saved.current?.u ?? fresh.current.u
  return (
    <div className={'editor' + (focus ? ' focus' : '')} role="dialog" aria-modal="true" aria-label="Escrever" ref={box}>
      <div className="paper">
        <h3>Escrever</h3>
        {error && <p className="warn">{error}</p>}
        <input className="e-title" placeholder="Título" aria-label="Título" value={f.t} onChange={(e) => change({ t: e.target.value })} />
        <input className="e-sub" placeholder="Subtítulo (opcional)" aria-label="Subtítulo" value={f.sub} onChange={(e) => change({ sub: e.target.value })} />
        <textarea ref={text} className="e-text" placeholder="Escreva aqui…" aria-label="Texto" value={f.x} onChange={(e) => change({ x: e.target.value })} />
        <div className="e-meta">
          <input placeholder="etiquetas, separadas por vírgula" aria-label="Etiquetas" value={f.tags} onChange={(e) => change({ tags: e.target.value })} />
          <select aria-label="Situação" value={f.st} onChange={(e) => change({ st: e.target.value as StoryStatus })}>
            <option value="d">rascunho</option>
            <option value="f">finalizada</option>
          </select>
        </div>
        <textarea className="e-note" placeholder="Nota pessoal (não aparece no livro)" aria-label="Nota pessoal" value={f.note} onChange={(e) => change({ note: e.target.value })} />
        <p className="e-count">
          {words(f.x)} palavras · {f.x.length} caracteres · editada {dateBR(edited)} · <span data-testid="save-status">{status}</span>
          {archive.cloud.state !== 'off' && status.startsWith('guardado') && <span data-testid="cloud-status"> · {cloudLabel(archive.cloud, archive.account)}</span>}
        </p>
        <div className="row e-actions">
          <button onClick={() => (sfx('ui.tick', { on: !focus }), setFocus(!focus))} aria-pressed={focus}>
            modo foco
          </button>
          <button onClick={() => (sfx('paper.pick'), setVersions(true))}>versões</button>
          <button onClick={() => exit({ st: 'd' }, () => ({ to: 'desk' }))}>deixar na mesa</button>
          <button onClick={() => exit({ st: 'f' }, (s) => (s ? { to: 'book', id: s.id } : { to: 'stay' }))}>enviar ao livro</button>
          <button className="primary" onClick={() => exit(undefined, (s) => (s ? { to: 'book', id: s.id } : { to: 'stay' }))}>
            guardar e ver no livro
          </button>
          <button onClick={() => exit(undefined, () => ({ to: 'stay' }))}>fechar</button>
        </div>
      </div>
      {versions && (
        <Versions boxRef={versionsBox} onClose={() => setVersions(false)}>
            <h3>Versões anteriores</h3>
            {saved.current?.v?.length ? (
              <ul className="list">
                {saved.current.v
                  .slice()
                  .reverse()
                  .map((v, i) => (
                    <li key={v.u + ':' + i}>
                      <div>
                        <b>{v.t || 'Sem título'}</b> <i>{new Date(v.u).toLocaleString('pt-BR')} · {words(v.x)} palavras</i>
                      </div>
                      <button onClick={() => (sfx('paper.pick'), restoreVersion(i))}>restaurar</button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>Ainda não há versões guardadas. Elas são criadas enquanto você edita.</p>
            )}
            <div className="row">
              <button onClick={() => setVersions(false)}>fechar</button>
            </div>
        </Versions>
      )}
    </div>
  )
}

function Versions({ boxRef, onClose, children }: { boxRef: RefObject<HTMLDivElement | null>; onClose: () => void; children: ReactNode }) {
  useModal(boxRef, onClose)
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Versões anteriores" ref={boxRef}>
      <div className="modal">{children}</div>
    </div>
  )
}
