import { allMarkdown, allTags, dateBR, duplicate, libraryList, slug, stats, storyText, swapOrder, type LibraryQuery, type SortKey } from '../data/stories'
import type { Story } from '../data/types'
import type { Archive } from '../state/useArchive'
import { makeBackup } from './backupFlow'
import { sfx } from '../audio/sfx'
import type { Ui } from './ui'

const WEEK = 6048e5

/** Acervo: busca, filtros, ordem do livro, lixeira, exportação e backup (openLib/list do original). */
export function Library({ archive: a, ui, query, setQuery, onRead, onEdit, onClose }: {
  archive: Archive
  ui: Ui
  query: LibraryQuery
  setQuery: (q: LibraryQuery) => void
  onRead: (id: string) => void
  onEdit: (s: Story) => void
  onClose: () => void
}) {
  const items = libraryList(a.stories, query)
  const st = stats(a.stories)
  const tags = allTags(a.stories)
  const fail = (e: Error) => ui.toast('Erro: ' + e.message)
  const save = (list: Story[]) => a.saveStories(list).catch(fail)
  const now = Date.now()

  const purge = async (s: Story) => {
    const k = await ui.ask(
      <p>
        Excluir <b>{s.t || 'Sem título'}</b> definitivamente? Isso não pode ser desfeito.
      </p>,
      ['Excluir para sempre', 'Manter'],
    )
    if (k === 0) a.purgeStory(s.id).then(() => sfx('paper.tear'), fail)
  }

  return (
    <section className="panel library" aria-label="Acervo">
      <h3>Acervo</h3>
      <p className="stats" data-testid="stats">
        {st.visible} histórias · {st.words} palavras · {st.drafts} rascunhos · {st.trash} na lixeira · último backup{' '}
        {a.config.lb ? dateBR(a.config.lb) : 'nunca'}
      </p>
      <div className="row filters">
        <input placeholder="Pesquisar título, texto, etiquetas…" aria-label="Pesquisar" value={query.q} onChange={(e) => setQuery({ ...query, q: e.target.value })} />
        <select aria-label="Situação" value={query.f} onChange={(e) => setQuery({ ...query, f: e.target.value as LibraryQuery['f'] })}>
          <option value="">todas</option>
          <option value="d">rascunhos</option>
          <option value="f">finalizadas</option>
        </select>
        <select aria-label="Etiqueta" value={query.g} onChange={(e) => setQuery({ ...query, g: e.target.value })}>
          <option value="">etiquetas</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Ordem" value={query.o} onChange={(e) => setQuery({ ...query, o: e.target.value as SortKey })}>
          <option value="o">ordem do livro</option>
          <option value="t">título</option>
          <option value="c">criação</option>
          <option value="u">modificação</option>
        </select>
      </div>
      <div className="row">
        <button onClick={() => (sfx('seal.stamp'), makeBackup(a, ui))}>Backup do acervo</button>
        <button onClick={() => ui.pickBackup()}>Restaurar backup</button>
        <button onClick={() => ui.paste()}>Colar backup</button>
        <button onClick={() => (sfx('paper.pick'), ui.offer('arquivo-das-sombras.md', allMarkdown(a.stories)))}>Exportar tudo .md</button>
        <button onClick={() => (sfx('ui.tick', { on: !query.tr }), setQuery({ ...query, tr: !query.tr }))}>{query.tr ? '← voltar ao acervo' : `Lixeira (${st.trash})`}</button>
        <button onClick={onClose}>fechar</button>
      </div>
      <ul className="list" data-testid="list">
        {items.map(({ story: s, snippet }) => (
          <li key={s.id}>
            <div className="t">
              <b>{s.t || 'Sem título'}</b>{' '}
              <i>
                {s.st === 'd' ? 'rascunho' : 'finalizada'} · {dateBR(s.c)}
                {now - s.u < WEEK ? ' · modificada recentemente' : ''}
                {(s.tags || []).length ? ' · ' + s.tags.join(', ') : ''}
              </i>
              {snippet && <p>{snippet}</p>}
            </div>
            <div className="ac">
              {query.tr ? (
                <>
                  <button onClick={() => (sfx('paper.pick'), save([{ ...s, del: false }]))}>recuperar</button>
                  <button onClick={() => purge(s)}>excluir de vez</button>
                </>
              ) : (
                <>
                  <button onClick={() => onRead(s.id)}>ler</button>
                  <button onClick={() => onEdit(s)}>editar</button>
                  <button aria-label="subir" onClick={() => (sfx('ui.tick'), save(swapOrder(a.stories, s.id, -1)))}>
                    ↑
                  </button>
                  <button aria-label="descer" onClick={() => (sfx('ui.tick'), save(swapOrder(a.stories, s.id, 1)))}>
                    ↓
                  </button>
                  <button aria-label={s.fav ? 'tirar dos favoritos' : 'favoritar'} onClick={() => (sfx('ui.tick', { on: !s.fav }), save([{ ...s, fav: !s.fav }]))}>
                    {s.fav ? '★' : '☆'}
                  </button>
                  <button onClick={() => (sfx('paper.pick'), save([duplicate(a.stories, s)]))}>duplicar</button>
                  <button onClick={() => (sfx('paper.pick'), ui.offer(slug(s) + '.txt', storyText(s, false)))}>.txt</button>
                  <button onClick={() => (sfx('paper.pick'), ui.offer(slug(s) + '.md', storyText(s, true)))}>.md</button>
                  <button onClick={() => (sfx('paper.crumple'), save([{ ...s, del: true }]))}>lixeira</button>
                </>
              )}
            </div>
          </li>
        ))}
        {!items.length && (
          <li>
            <i>{a.stories.length ? 'Nada por aqui.' : 'Nenhuma história neste navegador ainda. Escreva uma nova ou restaure um backup do app original.'}</i>
          </li>
        )}
      </ul>
    </section>
  )
}
