import type { BackupFile, Config, Story } from './types'

// Regras de backup e restauração portadas do HTML original (funções backup, norm, restore).

export function backupFileName(now = new Date()): string {
  return `arquivo-das-sombras-backup-${now.toISOString().slice(0, 10)}.json`
}

/** Gera o texto do backup no mesmo formato v1 do original. */
export function serializeBackup(config: Config, stories: Story[], now = new Date()): string {
  const file: BackupFile = { app: 'arquivo-das-sombras', v: 1, exported: now.toISOString(), config, stories }
  return JSON.stringify(file, null, 1)
}

/** Completa e corrige um registro vindo de um backup (função `norm` do original). */
export function normalizeStory(b: Record<string, unknown>, i: number): Story {
  const now = Date.now()
  const s: Story = {
    id: String(b.id),
    t: String(b.t || ''),
    sub: String(b.sub || ''),
    x: b.x as string,
    tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
    st: b.st === 'f' ? 'f' : 'd',
    note: String(b.note || ''),
    fav: !!b.fav,
    del: !!b.del,
    c: Number(b.c) || now,
    u: Number(b.u) || Number(b.c) || now,
    o: typeof b.o === 'number' ? b.o : i + 1,
  }
  if (Array.isArray(b.v)) s.v = b.v as Story['v']
  return s
}

export type ParseResult =
  | { ok: true; stories: Story[]; config?: Record<string, unknown> }
  | { ok: false; error: string }

/** Valida o texto de um backup. Mesmas mensagens do original; nada é gravado aqui. */
export function parseBackup(text: string): ParseResult {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Arquivo inválido: não é JSON. Nada foi alterado.' }
  }
  const f = j as Partial<BackupFile> | null
  const valid =
    !!f &&
    f.app === 'arquivo-das-sombras' &&
    Array.isArray(f.stories) &&
    f.stories.every((s) => !!s && typeof s.id === 'string' && typeof s.x === 'string')
  if (!valid) return { ok: false, error: 'Arquivo inválido ou incompleto. Nada foi alterado.' }
  return {
    ok: true,
    stories: f.stories!.map((s, i) => normalizeStory(s as unknown as Record<string, unknown>, i)),
    config: f.config && typeof f.config === 'object' ? (f.config as Record<string, unknown>) : undefined,
  }
}

export type MergeMode = 'keep-current' | 'use-backup'

export interface MergePlan {
  /** registros a gravar (novos e, no modo use-backup, os conflitantes) */
  write: Story[]
  conflicts: number
  identical: number
}

/** Decide o que gravar numa mesclagem, sem tocar no banco (lógica do original). */
export function planMerge(current: Story[], incoming: Story[], mode: MergeMode): MergePlan {
  const byId = new Map(current.map((s) => [s.id, s]))
  let maxOrder = current.reduce((m, s) => Math.max(m, s.o), 0)
  const write: Story[] = []
  let conflicts = 0
  let identical = 0
  for (const b of incoming) {
    const e = byId.get(b.id)
    if (!e) write.push({ ...b, o: ++maxOrder })
    else if (e.u === b.u && e.x === b.x) identical++
    else {
      conflicts++
      if (mode === 'use-backup') write.push({ ...b, o: e.o })
    }
  }
  return { write, conflicts, identical }
}

/** Aplica um plano à lista em memória, na mesma forma que o original faz depois de gravar. */
export function applyMerge(current: Story[], write: Story[]): Story[] {
  const next = current.slice()
  for (const b of write) {
    const i = next.findIndex((a) => a.id === b.id)
    if (i >= 0) next[i] = b
    else next.push(b)
  }
  return next
}
