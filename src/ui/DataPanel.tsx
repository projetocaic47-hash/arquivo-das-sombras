import { useRef, useState } from 'react'
import type { Story } from '../data/types'
import { useArchive } from '../state/useArchive'
import { Dialog } from './Dialog'

type Ask = { text: React.ReactNode; choices: string[]; resolve: (i: number) => void }

function words(s: string) {
  return (s.match(/\S+/g) || []).length
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * Painel provisório da Fase 2: prova que a nova aplicação lê o mesmo banco
 * do original e importa ou exporta backups reais. Será substituído pela
 * interface definitiva nas fases seguintes.
 */
export function DataPanel() {
  const a = useArchive()
  const file = useRef<HTMLInputElement>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')

  const question = (text: React.ReactNode, choices: string[]) =>
    new Promise<number>((resolve) => setAsk({ text, choices, resolve }))

  const restore = async (text: string) => {
    const r = a.parseBackup(text)
    if (!r.ok) return setNote(r.error)
    const c = await question(
      <p>
        O backup contém <b>{r.stories.length}</b> histórias; o acervo atual tem <b>{a.stories.length}</b>. Como restaurar?
      </p>,
      ['Substituir o acervo atual', 'Mesclar (nos conflitos, manter as atuais)', 'Mesclar (nos conflitos, usar as do backup)', 'Cancelar'],
    )
    try {
      if (c === 3) return
      if (c === 0) {
        const k = await question(
          <p>
            Isto <b>substitui</b> tudo o que está no acervo agora. Tem certeza?
          </p>,
          ['Sim, substituir', 'Cancelar'],
        )
        if (k) return
        await a.importReplace(r.stories, r.config)
        return setNote(`Acervo restaurado: ${r.stories.length} histórias.`)
      }
      const p = await a.importMerge(r.stories, c === 2 ? 'use-backup' : 'keep-current')
      setNote(`Mesclado: ${p.write.length} gravadas, ${p.conflicts} conflitos (${c === 2 ? 'usadas as do backup' : 'mantidas as atuais'}), ${p.identical} idênticas.`)
    } catch (e) {
      setNote(`Falha; o acervo atual foi preservado: ${(e as Error).message}`)
    }
  }

  const visible = a.stories.filter((s) => !s.del).sort((x, y) => x.o - y.o)
  const trash = a.stories.length - visible.length
  const drafts = visible.filter((s) => s.st === 'd').length
  const totalWords = visible.reduce((n, s) => n + words(s.x), 0)

  return (
    <main className="panel">
      <header>
        <small>✦ ❖ ✦</small>
        <h1>{a.config.n}</h1>
        <p className="phrase">{a.config.p}</p>
      </header>

      {a.status.kind === 'loading' && <p>Abrindo o acervo…</p>}
      {a.status.kind === 'error' && <p className="warn">{a.status.message}</p>}
      {a.status.kind === 'ready' && (
        <>
          <p className="stats" data-testid="stats">
            {visible.length} histórias · {totalWords} palavras · {drafts} rascunhos · {trash} na lixeira · último backup{' '}
            {a.config.lb ? new Date(a.config.lb).toLocaleDateString('pt-BR') : 'nunca'}
          </p>
          <div className="row">
            <button onClick={() => file.current?.click()}>Restaurar backup</button>
            <button
              onClick={() =>
                a.exportBackup().then(({ name, text }) => download(name, text), (e: Error) => setNote('Não foi possível salvar: ' + e.message))
              }
            >
              Backup do acervo
            </button>
          </div>
          {note && <p className="note" role="status">{note}</p>}
          <ol className="list" data-testid="list">
            {visible.map((s: Story) => (
              <li key={s.id}>
                <b>{s.t || 'Sem título'}</b>
                <i>
                  {s.st === 'd' ? 'rascunho' : 'finalizada'} · {words(s.x)} palavras · {new Date(s.c).toLocaleDateString('pt-BR')}
                </i>
              </li>
            ))}
            {!visible.length && <li><i>Nenhuma história neste navegador ainda. Restaure um backup do app original.</i></li>}
          </ol>
        </>
      )}

      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) f.text().then(restore, () => setNote('Não foi possível ler o arquivo.'))
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
    </main>
  )
}
