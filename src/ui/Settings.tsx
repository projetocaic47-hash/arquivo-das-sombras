import { useRef, useSyncExternalStore } from 'react'
import { getSoundPrefs, onSoundPrefs, setSoundPrefs, sfx } from '../audio/sfx'
import { dateBR, stats } from '../data/stories'
import type { Archive } from '../state/useArchive'
import { makeBackup } from './backupFlow'
import type { Ui } from './ui'

/** Ajustes do acervo, como openSet do original. */
export function Settings({ archive: a, ui, onClose }: { archive: Archive; ui: Ui; onClose: () => void }) {
  const c = a.config
  const st = stats(a.stories)
  const som = useSyncExternalStore(onSoundPrefs, getSoundPrefs)
  // ao arrastar o volume, um clique de amostra no máximo a cada 150 ms
  const lastTick = useRef(0)
  const preview = () => {
    const now = performance.now()
    if (now - lastTick.current < 150) return
    lastTick.current = now
    sfx('ui.tick')
  }
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
        <input type="checkbox" checked={!!c.rm} onChange={(e) => (sfx('ui.tick', { on: e.target.checked }), set({ rm: e.target.checked }))} /> Reduzir animações
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={som.on}
          onChange={(e) => {
            setSoundPrefs({ on: e.target.checked })
            if (e.target.checked) sfx('ui.tick')
          }}
        />{' '}
        Som (efeitos e chuva)
      </label>
      <label className="check">
        <input type="checkbox" checked={som.amb} disabled={!som.on} onChange={(e) => (sfx('ui.tick', { on: e.target.checked }), setSoundPrefs({ amb: e.target.checked }))} /> Chuva e trovões
      </label>
      <label>
        Volume geral <output>{Math.round(som.vol * 100)}%</output>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(som.vol * 100)}
          disabled={!som.on}
          onChange={(e) => {
            setSoundPrefs({ vol: +e.target.value / 100 })
            preview()
          }}
        />
      </label>
      <label>
        Volume da chuva <output>{Math.round(som.ambVol * 100)}%</output>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(som.ambVol * 100)}
          disabled={!som.on || !som.amb}
          onChange={(e) => setSoundPrefs({ ambVol: +e.target.value / 100 })}
        />
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
    </section>
  )
}
