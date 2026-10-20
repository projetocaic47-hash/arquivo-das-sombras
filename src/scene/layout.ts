// Medidas da cena em metros (Y para cima; a parede da janela fica em -Z).
export const ROOM = { halfWidth: 1.7, height: 2.7, front: 1.8 }
export const WALL = { z: -1.25, thickness: 0.22 }
export const WINDOW = { width: 0.86, height: 1.22, sill: 0.98, cx: 0 }
export const DESK = { width: 1.4, depth: 0.66, height: 0.76, top: 0.035, z: -0.92 }
export const CANDLE = { x: -0.25, z: -1.0, wax: 0.115 }
/** altura da base da chama: tampo + castiçal + vela */
export const FLAME_BASE_Y = DESK.height + 0.032 + CANDLE.wax + 0.006
export const BOOK = { x: -0.01, z: -0.8, rotY: -0.16, w: 0.17, h: 0.245, t: 0.046 }
/**
 * Livro aberto para leitura: posição da lombada e giro. Ao abrir, o livro desliza
 * do lugar em que está fechado (BOOK) para cá, como quem o puxa para perto.
 */
export const BOOK_OPEN = { x: 0.02, z: -0.76, rotY: -0.04 }
