import { useSyncExternalStore } from 'react'
import { sound, type WritingSound } from '../audio/sound'
import { dateBR, stats } from '../data/stories'
import type { Archive } from '../state/useArchive'
import { makeBackup } from './backupFlow'
import type { Ui } from './ui'

/** Ajustes do acervo (como openSet do original) e do som deste aparelho. */
export function Settings({ archive: a, ui, onClose }: { archive: Archive; ui: Ui; onClose: () => void }) {
  const c = a.config
  const st = stats(a.stories)
  const snd = useSyncExternalStore(sound.subscribe, sound.getPrefs)
  const set = (p: Parameters<Archive['updateConfig']>[0]) => a.updateConfig(p).catch((e: Error) => ui.toast('Não foi possível salvar: ' + e.message))

  return (
    <section className="panel settings" aria-label="Ajustes">
      <h3>Ajustes</h3>
      <label>
        Nome do acervo
        {/* como no original, o nome não pode ficar vazio */}
        <input defaultValue={c.n} onChange={(e) => set({ n: e.target.value || c.n })} />
      </label>
      <label>
        Frase da capa
        <input defaultValue={c.p} onChange={(e) => set({ p: e.target.value })} />
      </label>
      <label>
        Tamanho da letra <output>{c.fs}</output>
        <input type="range" min={15} max={26} value={c.fs} onChange={(e) => set({ fs: +e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={!!c.rm} onChange={(e) => set({ rm: e.target.checked })} /> Reduzir animações
      </label>

      <h4>Som</h4>
      <label className="check">
        <input type="checkbox" checked={snd.on} onChange={(e) => (sound.setPrefs({ on: e.target.checked }), sound.unlock())} /> Som do quarto (chuva e trovões)
      </label>
      <label className="check">
        <input type="checkbox" checked={snd.music} onChange={(e) => sound.setPrefs({ music: e.target.checked })} /> Piano
      </label>
      <label>
        Som da escrita
        <select value={snd.writing} onChange={(e) => sound.setPrefs({ writing: e.target.value as WritingSound })}>
          <option value="maquina">máquina de escrever</option>
          <option value="lapis">lápis no papel</option>
          <option value="nenhum">nenhum</option>
        </select>
      </label>
      <label>
        Volume
        <input type="range" min={0} max={1} step={0.05} value={snd.volume} onChange={(e) => sound.setPrefs({ volume: +e.target.value })} />
      </label>

      <div className="row">
        <button onClick={() => makeBackup(a, ui)}>Backup do acervo</button>
        <button onClick={() => ui.pickBackup()}>Restaurar backup</button>
        <button onClick={() => ui.paste()}>Colar backup</button>
        <button onClick={onClose}>fechar</button>
      </div>
      <p className="small">
        Os textos ficam guardados apenas neste navegador e neste aparelho (IndexedDB). Limpar os dados do navegador pode apagar o acervo. Faça backups
        com frequência e guarde o arquivo em outro lugar.
      </p>
      <p className="small">
        {st.visible} histórias · {st.words} palavras · {st.drafts} rascunhos · última edição {st.lastEdit ? dateBR(st.lastEdit) : '—'} · último backup{' '}
        {c.lb ? dateBR(c.lb) : 'nunca'}
      </p>
      <p className="small credit">Piano: Salamander Grand Piano, de Alexander Holm (CC BY 3.0).</p>
    </section>
  )
}
