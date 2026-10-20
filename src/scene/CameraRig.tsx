import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { book } from '../book/controller'
import { atmosphere, noise1 } from './atmosphere'
import { PAGE_W, READING_ROT_Y, readingFocus } from './book/BookModel'
import { READ_HALF, READ_HALF_SINGLE } from './layout'

const BASE = new THREE.Vector3(0.02, 1.24, 0.72)
const TARGET = new THREE.Vector3(0, 1.02, -1.2)
const tmp = new THREE.Vector3()
const focus = new THREE.Vector3()

// Ao ler, a câmera se inclina sobre o livro aberto: quase de cima, para as letras não se deformarem.
const READ_DIR = new THREE.Vector3(0, 0.94, 0.34).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), READING_ROT_Y)
const FOCUS = readingFocus()
/** direção da largura do livro aberto, para deslizar entre as páginas */
const ACROSS = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), READING_ROT_Y)

/**
 * Faixas da tela ocupadas pelos botões (px): a barra do alto e a do livro, quando estão
 * deitadas. O livro aberto é enquadrado no espaço que sobra, para nenhuma linha ficar
 * escondida atrás deles. (No celular deitado elas ficam em pé, nas laterais.)
 */
function reserved(H: number) {
  const t = document.querySelector('.topbar')?.getBoundingClientRect()
  const b = document.querySelector('.bookbar')?.getBoundingClientRect()
  const top = t && t.height < H * 0.3 ? t.bottom + 6 : 0
  const bottom = b && b.width > b.height ? H - b.top + 6 : 0
  return { top, bottom }
}

/** Câmera sentada diante da mesa, com respiração lenta e leve paralaxe do mouse. */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const pointer = useRef({ x: 0, y: 0 })
  const smooth = useRef({ x: 0, y: 0 })
  const read = useRef(0)
  const across = useRef(0)
  const pos = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / innerWidth - 0.5) * 2
      pointer.current.y = (e.clientY / innerHeight - 0.5) * 2
    }
    addEventListener('pointermove', onMove)
    return () => removeEventListener('pointermove', onMove)
  }, [])

  // ?debug: os testes clicam nos objetos da mesa pela posição deles na tela
  useEffect(() => {
    if (!location.search.includes('debug')) return
    ;(window as unknown as { __project: (x: number, y: number, z: number) => number[] }).__project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera)
      return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]
    }
  }, [camera])

  // em telas em pé, abre o ângulo para a mesa e a janela continuarem visíveis
  const size = useThree((s) => s.size)
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const hfov = 62 // graus, largura mínima desejada
    const v = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) / Math.PI
    cam.fov = Math.min(74, Math.max(46, v))
    cam.updateProjectionMatrix()
  }, [camera, size])

  const offset = useRef(0)
  useFrame((_, dt) => {
    const t = atmosphere.time
    // aproximação suave do livro; sem animação, vai direto
    const goal = book.coverTarget
    read.current = atmosphere.reducedMotion ? goal : read.current + (goal - read.current) * (1 - Math.exp(-dt * 2.4))
    const r = read.current * read.current * (3 - 2 * read.current)
    // lendo, a câmera fica parada: o balanço faria as letras tremerem
    const still = atmosphere.reducedMotion ? 0 : 1 - r
    const k = 1 - Math.exp(-dt * 1.5)
    smooth.current.x += (pointer.current.x - smooth.current.x) * k
    smooth.current.y += (pointer.current.y - smooth.current.y) * k
    pos.set(
      BASE.x + still * (noise1(t * 0.13) * 0.012 + smooth.current.x * 0.05),
      BASE.y + still * (Math.sin(t * 0.45) * 0.004 + noise1(t * 0.11 + 9) * 0.008 - smooth.current.y * 0.025),
      BASE.z,
    )
    look.copy(TARGET)
    if (r > 0) {
      // distância que faz as duas páginas caberem na largura e na altura da tela
      const cam = camera as THREE.PerspectiveCamera
      const vt = Math.tan((cam.fov * Math.PI) / 360)
      const half = book.single ? READ_HALF_SINGLE : READ_HALF
      const H = size.height
      const band = reserved(H)
      const f = Math.max(0.4, (H - band.top - band.bottom) / H)
      const d = Math.max(half.w / (vt * cam.aspect), half.h / (vt * f))
      // centro do livro no meio do espaço livre entre as barras
      const shift = Math.round(((band.top - band.bottom) / 2) * r)
      if (shift !== offset.current) {
        offset.current = shift
        if (shift) cam.setViewOffset(size.width, H, 0, -shift, size.width, H)
        else cam.clearViewOffset()
      }
      // no modo de uma página, a câmera desliza até o meio da página em foco
      const goalX = book.single ? (book.side === 1 ? 1 : -1) * (PAGE_W / 2) : 0
      across.current = atmosphere.reducedMotion ? goalX : across.current + (goalX - across.current) * (1 - Math.exp(-dt * 3))
      focus.copy(FOCUS).addScaledVector(ACROSS, across.current)
      tmp.copy(READ_DIR).multiplyScalar(d).add(focus)
      pos.lerp(tmp, r)
      look.lerp(focus, r)
    } else if (offset.current) {
      offset.current = 0
      ;(camera as THREE.PerspectiveCamera).clearViewOffset()
    }
    camera.position.copy(pos)
    camera.lookAt(look)
  })
  return null
}
