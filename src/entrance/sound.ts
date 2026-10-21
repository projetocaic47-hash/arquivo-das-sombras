// Sons da porta de entrada. Passam pelo motor central (src/audio/sfx.ts): sintetizados na
// hora, ou trocados por arquivos de public/sons/ quando listados em lista.json
// (porta-batida-1/2/3, vela-acender, madeira-rangendo, porta-dobradicas).

import { sfx, stopSounds, type SoundName as Sfx } from '../audio/sfx'

export type SoundName = 'knock' | 'ignite' | 'creak' | 'hinges'

const NAMES: Record<SoundName, Sfx> = { knock: 'door.knock', ignite: 'door.ignite', creak: 'door.poster', hinges: 'door.hinges' }

/** Mantido por compatibilidade: a destrava agora é global (installSound, no início do app). */
export function unlockSound() {}

export function play(name: SoundName) {
  // a abertura da porta segue só o "reduzir movimento" do sistema; o som acompanha a mesma duração
  let reduced = false
  try {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // sem matchMedia
  }
  sfx(NAMES[name], { reduced })
}

/** Ao sair da porta: os sons da porta somem num fade, sem corte seco. */
export function stopAll() {
  for (const n of Object.values(NAMES)) stopSounds(n, 0.6)
}
