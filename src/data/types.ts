// Estrutura dos registros exatamente como o HTML original grava no IndexedDB.
// Os nomes curtos dos campos fazem parte do formato salvo: não renomear.

/** Uma versão anterior de uma história (até 15 por história). */
export interface StoryVersion {
  t: string
  x: string
  /** momento em que a versão foi guardada (ms desde 1970) */
  u: number
}

export type StoryStatus = 'd' | 'f' // d = rascunho, f = finalizada

/** Registro da gaveta `stories` (chave: `id`). */
export interface Story {
  id: string
  /** título */
  t: string
  /** subtítulo */
  sub: string
  /** texto completo */
  x: string
  tags: string[]
  st: StoryStatus
  /** nota pessoal, não aparece no livro */
  note: string
  fav: boolean
  /** está na lixeira */
  del: boolean
  /** criada em (ms) */
  c: number
  /** modificada em (ms) */
  u: number
  /** posição na ordem do livro */
  o: number
  /** versões anteriores (opcional) */
  v?: StoryVersion[]
}

/** Página relativa ao início de uma história, como o original guarda marcadores. */
export interface PageRef {
  sid: string
  off: number
}

/** Registro `cfg` da gaveta `meta`. Campos opcionais podem faltar em dados antigos. */
export interface Config {
  /** nome do acervo */
  n: string
  /** frase da capa */
  p: string
  /** tamanho da letra em px */
  fs: number
  /** reduzir animações */
  rm: boolean
  /** posição de leitura */
  pos?: PageRef
  /** marcadores */
  bm?: PageRef[]
  /** data do último backup (ms) */
  lb?: number
}

export const DEFAULT_CONFIG: Config = {
  n: 'ARQUIVO DAS SOMBRAS',
  p: 'o que o tempo não conseguiu apagar',
  fs: 19,
  rm: false,
}

/** Arquivo de backup .json, versão 1 (mesmo formato do original). */
export interface BackupFile {
  app: 'arquivo-das-sombras'
  v: 1
  exported: string
  config: Partial<Config>
  stories: Story[]
}
