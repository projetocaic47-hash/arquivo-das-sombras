import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { sound } from './audio/sound'
import { book } from './book/controller'
import type { BookPage } from './book/pages'
import { drafts, EMPTY_QUERY, words, type LibraryQuery } from './data/stories'
import type { PageRef, Story } from './data/types'
import { useArchive } from './state/useArchive'
import { restoreBackup } from './ui/backupFlow'
import { Dialog } from './ui/Dialog'
import { Editor, type EditorExit } from './ui/Editor'
import { anchorDownload, saveFile } from './ui/files'
import { Library } from './ui/Library'
import { Settings } from './ui/Settings'
import type { Ui } from './ui/ui'

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

/** Primeira página de cada história no livro. */
function firstPages(pages: BookPage[]) {
  const m = new Map<string, number>()
  pages.forEach((p, i) => p.k === 'story' && p.first && m.set(p.sid, i))
  return m
}

/** Página de história à vista: no celular a que está em foco; no livro aberto, a da esquerda primeiro. */
function storyPageInView(pages: BookPage[], spread: number, single: boolean, side: 0 | 1) {
  if (spread < 1) return -1
  const l = 2 * spread - 2
  const order = single ? [l + side] : [l, l + 1]
  return order.find((i) => pages[i]?.k === 'story') ?? -1
}

type Screen =
  | { k: 'editor'; story: Story | null }
  | { k: 'library' }
  | { k: 'settings' }
  | { k: 'sheets' }
  | { k: 'paste' }
  | { k: 'copy'; name: string; text: string }

type Ask = { text: ReactNode; choices: string[]; resolve: (i: number) => void }

export function App() {
  const archive = useArchive()
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [query, setQuery] = useState<LibraryQuery>(EMPTY_QUERY)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)
  const file = useRef<HTMLInputElement>(null)
  const bk = useSyncExternalStore(book.subscribe, book.getSnapshot)
  const snd = useSyncExternalStore(sound.subscribe, sound.getPrefs)
  const cfg = archive.config

  const ui = useMemo<Ui>(
    () => ({
      ask: (text, choices) => new Promise<number>((resolve) => setAsk({ text, choices, resolve })),
      toast: (m) => {
        setToast(m)
        clearTimeout(toastTimer.current)
        toastTimer.current = window.setTimeout(() => setToast(''), 4500)
      },
      offer: async (name, text) => {
        const r = await saveFile(name, text)
        if (r === 'fallback') setScreen({ k: 'copy', name, text })
        else if (r === 'saved') {
          setToast('Arquivo oferecido para download.')
          clearTimeout(toastTimer.current)
          toastTimer.current = window.setTimeout(() => setToast(''), 4500)
        }
      },
      paste: () => setScreen({ k: 'paste' }),
      pickBackup: () => file.current?.click(),
    }),
    [],
  )

  useEffect(() => {
    const on = () => book.setSingle(isSingle())
    on()
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])

  // o navegador só deixa o som começar depois de um gesto do usuário
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __sound: typeof sound }).__sound = sound
    const go = () => sound.unlock()
    addEventListener('pointerdown', go)
    addEventListener('keydown', go)
    return () => {
      removeEventListener('pointerdown', go)
      removeEventListener('keydown', go)
    }
  }, [])

  // setas viram as páginas e Esc fecha o livro (fora dos painéis)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (screen || ask || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') book.step(1)
      else if (e.key === 'ArrowLeft') book.step(-1)
      else if (e.key === 'Escape') book.close()
      else return
      e.preventDefault()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [screen, ask])

  // ---- livro: ir até uma história, posição de leitura e marcadores ----
  const first = useMemo(() => firstPages(bk.pages), [bk.pages])
  const pendingStory = useRef<string | null>(null)
  const goToStory = useCallback(
    (id: string) => {
      const i = first.get(id)
      // história recém-gravada: o livro ainda está sendo repaginado; vai quando ficar pronto
      if (i === undefined) pendingStory.current = id
      else book.goToPage(i)
    },
    [first],
  )
  useEffect(() => {
    const id = pendingStory.current
    if (!id) return
    const i = first.get(id)
    if (i !== undefined) {
      pendingStory.current = null
      book.goToPage(i)
    }
  }, [first])

  const refAt = (i: number): PageRef | null => {
    const p = bk.pages[i]
    if (!p || p.k !== 'story') return null
    return { sid: p.sid, off: i - (first.get(p.sid) ?? i) }
  }
  const pageOf = (r: PageRef) => {
    const f = first.get(r.sid)
    return f === undefined ? -1 : Math.min(f + r.off, bk.pages.length - 1)
  }
  const inView = bk.reading ? storyPageInView(bk.pages, bk.spread, bk.single, bk.side) : -1
  const viewRef = inView >= 0 ? refAt(inView) : null

  // guarda onde a leitura parou (como o original, 1,5 s depois de parar numa página)
  useEffect(() => {
    if (!viewRef || bk.turning) return
    if (cfg.pos && cfg.pos.sid === viewRef.sid && cfg.pos.off === viewRef.off) return
    const t = setTimeout(() => archive.updateConfig({ pos: viewRef }).catch(() => {}), 1500)
    return () => clearTimeout(t)
  }, [viewRef?.sid, viewRef?.off, bk.turning]) // eslint-disable-line react-hooks/exhaustive-deps

  const marked = !!viewRef && (cfg.bm || []).some((m) => m.sid === viewRef.sid && m.off === viewRef.off)
  const toggleMark = () => {
    if (!viewRef) return ui.toast('Abra uma página de história para marcar.')
    const bm = (cfg.bm || []).slice()
    const k = bm.findIndex((m) => m.sid === viewRef.sid && m.off === viewRef.off)
    if (k >= 0) bm.splice(k, 1)
    else bm.push(viewRef)
    archive.updateConfig({ bm }).then(
      () => ui.toast(k >= 0 ? 'Marcador removido.' : 'Página marcada — ela aparece na capa.'),
      (e: Error) => ui.toast('Não foi possível salvar: ' + e.message),
    )
  }
  const storyInView = viewRef ? archive.stories.find((s) => s.id === viewRef.sid) : undefined

  // ---- telas ----
  const openEditor = (story: Story | null) => setScreen({ k: 'editor', story })
  const editorExit = (e: EditorExit) => {
    setScreen(null)
    if (e.to === 'book') goToStory(e.id)
    else if (e.to === 'desk') book.close()
  }
  const openSheet = (id: string | null) => {
    if (screen) return
    openEditor(id ? (archive.stories.find((s) => s.id === id) ?? null) : null)
  }

  const visible = archive.stories.filter((s) => !s.del).length
  const loose = drafts(archive.stories)
  const daysSinceBackup = cfg.lb ? Math.floor((Date.now() - cfg.lb) / 864e5) : -1
  const continuePage = cfg.pos ? pageOf(cfg.pos) : -1
  const marks = (cfg.bm || [])
    .slice(0, 4)
    .map((m) => ({ page: pageOf(m), story: archive.stories.find((s) => s.id === m.sid) }))
    .filter((m) => m.page >= 0 && m.story)

  return (
    <>
      <Suspense fallback={null}>
        <SceneRoot onReady={() => setReady(true)} stories={archive.stories} config={cfg} onOpenSheet={openSheet} />
      </Suspense>
      <div className={'loading' + (ready ? ' done' : '')} aria-live="polite" data-ready={ready}>
        acendendo a vela…
      </div>
      {archive.status.kind === 'error' && <p className="warnbar">{archive.status.message}</p>}
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}

      <nav className="topbar" aria-label="Fitas de navegação">
        <button onClick={() => setScreen({ k: 'library' })}>Acervo</button>
        <button onClick={() => openEditor(null)}>Escrever</button>
        <button onClick={() => setScreen({ k: 'sheets' })}>Folhas soltas · {loose.length}</button>
        <button onClick={() => setScreen({ k: 'settings' })}>Ajustes</button>
        <button
          aria-pressed={snd.on}
          onClick={() => {
            sound.setPrefs({ on: !snd.on })
            sound.unlock()
          }}
        >
          Som: {snd.on ? 'ligado' : 'desligado'}
        </button>
      </nav>

      {ready && !bk.reading && (
        <div className="bookbar closed">
          <div className="row">
            <button onClick={() => book.open()}>Abrir o livro</button>
            {continuePage >= 0 && <button onClick={() => book.goToPage(continuePage)}>Continuar leitura</button>}
          </div>
          {marks.length > 0 && (
            <div className="row marks">
              {marks.map((m) => (
                <button key={m.page} className="mark" onClick={() => book.goToPage(m.page)}>
                  marcador · p. {m.page} · {(m.story!.t || 'Sem título').slice(0, 26)}
                </button>
              ))}
            </div>
          )}
          {visible > 0 && (daysSinceBackup < 0 || daysSinceBackup > 6) && (
            <p className="bnote">{daysSinceBackup < 0 ? 'nenhum backup feito ainda — faça um em Acervo' : `último backup há ${daysSinceBackup} dias`}</p>
          )}
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
          <button onClick={() => book.goToPage(1)}>Índice</button>
          <button onClick={toggleMark} aria-pressed={marked}>
            {marked ? 'Desmarcar' : 'Marcar'}
          </button>
          {storyInView && <button onClick={() => openEditor(storyInView)}>Editar esta</button>}
          <button onClick={() => book.close()}>Fechar</button>
        </div>
      )}
      <p className="phase-tag">Fase 5 · editor, acervo e som</p>

      {screen?.k === 'editor' && <Editor archive={archive} story={screen.story} onExit={editorExit} />}
      {screen && screen.k !== 'editor' && (
        <div className="overlay" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && !ask && setScreen(null)}>
          <div className="sheet">
            {screen.k === 'library' && (
              <Library
                archive={archive}
                ui={ui}
                query={query}
                setQuery={setQuery}
                onRead={(id) => {
                  setScreen(null)
                  goToStory(id)
                }}
                onEdit={openEditor}
                onClose={() => setScreen(null)}
              />
            )}
            {screen.k === 'settings' && <Settings archive={archive} ui={ui} onClose={() => setScreen(null)} />}
            {screen.k === 'sheets' && (
              <section className="panel" aria-label="Folhas soltas">
                <h3>Folhas soltas</h3>
                <div className="sheets-grid">
                  <button className="loose new" onClick={() => openEditor(null)}>
                    <b>Nova folha</b>
                    <span>Toque para começar a escrever…</span>
                    <i>+</i>
                  </button>
                  {loose.map((s) => (
                    <button key={s.id} className="loose" onClick={() => openEditor(s)}>
                      <b>{s.t || 'Sem título'}</b>
                      <span>{s.x.replace(/\s+/g, ' ').trim().slice(0, 120)}</span>
                      <i>{words(s.x)} palavras</i>
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button onClick={() => setScreen(null)}>fechar</button>
                </div>
              </section>
            )}
            {screen.k === 'paste' && <PasteBackup onCancel={() => setScreen(null)} onGo={(t) => restoreBackup(t, archive, ui).then((ok) => ok && setScreen(null))} />}
            {screen.k === 'copy' && <CopyFile name={screen.name} text={screen.text} ui={ui} onClose={() => setScreen(null)} />}
          </div>
        </div>
      )}

      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f)
            f.text().then(
              (t) => restoreBackup(t, archive, ui).then((ok) => ok && setScreen(null)),
              () => ui.toast('Não foi possível ler o arquivo.'),
            )
        }}
      />
      {ask && (
        <Dialog
          choices={ask.choices}
          onChoose={(i) => {
            setAsk(null)
            ask.resolve(i)
          }}
        >
          {ask.text}
        </Dialog>
      )}
    </>
  )
}

function PasteBackup({ onCancel, onGo }: { onCancel: () => void; onGo: (text: string) => void }) {
  const [t, setT] = useState('')
  return (
    <section className="panel" aria-label="Colar backup">
      <h3>Colar backup</h3>
      <p className="small">Cole aqui o conteúdo completo do arquivo de backup (.json).</p>
      <textarea className="big" value={t} onChange={(e) => setT(e.target.value)} aria-label="Conteúdo do backup" />
      <div className="row">
        <button onClick={() => onGo(t)}>Continuar</button>
        <button onClick={onCancel}>cancelar</button>
      </div>
    </section>
  )
}

/** Quando o download direto não funciona: o texto do arquivo para copiar (fb() do original). */
function CopyFile({ name, text, ui, onClose }: { name: string; text: string; ui: Ui; onClose: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  return (
    <section className="panel" aria-label="Cópia do arquivo">
      <h3>Cópia do arquivo</h3>
      <p className="small">
        O download direto não está disponível aqui. Use “Copiar tudo”, cole num bloco de notas e salve como <b>{name}</b>. Ou tente o botão de baixar.
      </p>
      <textarea ref={area} className="big" readOnly value={text} aria-label="Conteúdo do arquivo" />
      <div className="row">
        <button
          onClick={() => {
            area.current?.select()
            navigator.clipboard?.writeText(text).then(
              () => ui.toast('Copiado.'),
              () => {
                document.execCommand('copy')
                ui.toast('Copiado.')
              },
            )
          }}
        >
          Copiar tudo
        </button>
        <button onClick={() => anchorDownload(name, text)}>Tentar baixar</button>
        <button onClick={onClose}>fechar</button>
      </div>
    </section>
  )
}
