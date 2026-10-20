import type { ReactNode } from 'react'

/** Serviços da interface que os painéis usam: perguntar, avisar e entregar arquivos. */
export interface Ui {
  /** pergunta com botões (ask() do original); devolve o índice escolhido */
  ask(text: ReactNode, choices: string[]): Promise<number>
  /** aviso passageiro no alto da tela */
  toast(message: string): void
  /** oferece um arquivo para baixar; se não der, mostra o texto para copiar */
  offer(name: string, text: string): Promise<void>
  /** abre a tela de colar um backup */
  paste(): void
  /** abre o seletor de arquivo de backup */
  pickBackup(): void
}
