// Sons da porta de entrada. Passam pelo motor central (src/audio/sfx.ts): sintetizados na
// hora, ou trocados por arquivos de public/sons/ quando listados em lista.json
// (porta-batida-1/2/3, vela-acender, madeira-rangendo, porta-abrindo).
//
// Abertura: o tranco de desprender toca junto com o primeiro movimento; o rangido gravado
// (public/sons/porta-abrindo.mp3, só abertura, sem batida de fechar) entra quando a folha
// começa a girar de verdade (1 s depois, ver doorAngle), e os estalos espaçados do fim da
// gravação caem na desaceleração, quando a porta para. Agendado no relógio do áudio.

import { sfx, stopSounds, type SoundName as Sfx } from '../audio/sfx'

export type SoundName = 'knock' | 'ignite' | 'creak' | 'hinges'

const NAMES: Record<SoundName, Sfx> = { knock: 'door.knock', ignite: 'door.ignite', creak: 'door.poster', hinges: 'door.hinges' }
/** segundos entre o início da abertura e o rangido longo (fim do "emperra" em doorAngle) */
export const CREAK_AT = 1.0

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
  if (name === 'hinges' && !reduced) {
    sfx('door.unlatch')
    sfx('door.creak', { delay: CREAK_AT })
  } else sfx(NAMES[name], { reduced })
}

/** Ao sair da porta: os sons da porta somem num fade, sem corte seco. */
export function stopAll() {
  for (const n of [...Object.values(NAMES), 'door.unlatch', 'door.creak'] as Sfx[]) stopSounds(n, 0.6)
}
