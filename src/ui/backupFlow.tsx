import type { Archive } from '../state/useArchive'
import type { Ui } from './ui'

// Backup e restauração com as mesmas perguntas e mensagens do original.

export async function makeBackup(a: Archive, ui: Ui) {
  try {
    const { name, text } = await a.exportBackup()
    await ui.offer(name, text)
  } catch (e) {
    ui.toast('Não foi possível salvar: ' + (e as Error).message)
  }
}

/** Restaura um backup colado ou escolhido; devolve verdadeiro se algo mudou. */
export async function restoreBackup(text: string, a: Archive, ui: Ui): Promise<boolean> {
  const r = a.parseBackup(text)
  if (!r.ok) {
    ui.toast(r.error)
    return false
  }
  const c = await ui.ask(
    <p>
      O backup contém <b>{r.stories.length}</b> histórias; o acervo atual tem <b>{a.stories.length}</b>. Como restaurar?
    </p>,
    ['Substituir o acervo atual', 'Mesclar (nos conflitos, manter as atuais)', 'Mesclar (nos conflitos, usar as do backup)', 'Cancelar'],
  )
  if (c === 3) return false
  try {
    if (c === 0) {
      const k = await ui.ask(
        <p>
          Isto <b>substitui</b> tudo o que está no acervo agora. Tem certeza?
        </p>,
        ['Sim, substituir', 'Cancelar'],
      )
      if (k) return false
      await a.importReplace(r.stories, r.config)
      ui.toast(`Acervo restaurado: ${r.stories.length} histórias.`)
      return true
    }
    const p = await a.importMerge(r.stories, c === 2 ? 'use-backup' : 'keep-current')
    ui.toast(`Mesclado: ${p.write.length} gravadas, ${p.conflicts} conflitos (${c === 2 ? 'usadas as do backup' : 'mantidas as atuais'}), ${p.identical} idênticas.`)
    return true
  } catch (e) {
    ui.toast(`Falha; o acervo atual foi preservado: ${(e as Error).message}`)
    return false
  }
}
