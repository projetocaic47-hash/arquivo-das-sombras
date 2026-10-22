import type { Archive } from '../state/useArchive'

/** Texto curto do estado da nuvem (aviso do canto e linha do editor). */
export function cloudLabel(s: Archive['cloud'], acc: Archive['account']) {
  if (s.state === 'off') return acc.kind === 'supabase' && !acc.email ? 'entrar para salvar na nuvem' : 'só neste aparelho'
  if (s.error && s.state !== 'syncing') return 'erro ao salvar na nuvem · tentando de novo'
  return { syncing: 'salvando na nuvem…', saved: 'salvo na nuvem', pending: 'alterações pendentes' }[s.state]
}
