// Entregar um arquivo gerado pelo app (backup, .txt, .md), como save() no original:
// dentro do Claude, pelo recurso de downloads da página; num site comum, pelo download
// do navegador. Se nenhum funcionar, a interface mostra o texto para copiar.

type Downloads = { save(r: { filename: string; data: string }): Promise<unknown> }
type ClaudeHost = { use(name: string): Promise<unknown> }

export type SaveOutcome = 'saved' | 'declined' | 'fallback'

function anchorDownload(name: string, text: string) {
  const type = name.endsWith('.json') ? 'application/json' : 'text/plain'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // prazo folgado: com o quarto 3D ocupando a tela, aparelhos lentos podem demorar a iniciar o download
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}

export async function saveFile(name: string, text: string): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    try {
      const d = (await host.use('downloads')) as Downloads | null
      if (!d) return 'fallback'
      await d.save({ filename: name, data: text })
      return 'saved'
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'fallback'
    }
  }
  try {
    anchorDownload(name, text)
    return 'saved'
  } catch {
    return 'fallback'
  }
}

/** Para o botão "Tentar baixar" da tela de cópia. */
export { anchorDownload }
