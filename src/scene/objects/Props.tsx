import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { drafts, words } from '../../data/stories'
import type { Story } from '../../data/types'
import { clickable, useHovered } from '../hover'
import { outlineMaterial } from '../outline'
import { DESK } from '../layout'
import { loadPageFonts } from '../book/pageArt'
import { usePbr } from '../textures'

// Folhas soltas sobre a mesa: os rascunhos mais recentes (como no original, até 5)
// e uma folha em branco para começar a escrever. Um clique abre o editor.

/** contorno da folha (0,15 × 0,212 m), para a borda dourada ao passar o mouse */
const SHEET_EDGE = new THREE.BufferGeometry().setAttribute(
  'position',
  new THREE.BufferAttribute(new Float32Array([-0.077, -0.108, 0, 0.077, -0.108, 0, 0.077, 0.108, 0, -0.077, 0.108, 0]), 3),
)

const SW = 256
const SH = 362
const BODY = `"Jersey 10", monospace`

/** Lugares das folhas: [x, z, giro]. A primeira é a "Nova folha". */
const SLOTS: [number, number, number][] = [
  [0.47, -0.76, -0.42],
  [-0.46, -0.76, 0.34],
  [-0.4, -0.8, 0.1],
  [-0.5, -0.86, 0.62],
  [0.53, -0.88, -0.18],
  [0.42, -0.86, -0.7],
]

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + w : w
    if (line && ctx.measureText(next).width > width) {
      out.push(line)
      if (out.length === max) return out
      line = w
    } else line = next
  }
  if (line && out.length < max) out.push(line)
  return out
}

/** Desenho da folha: título, começo do texto e número de palavras (card() do original). */
function sheetArt(s: Story | null) {
  const c = document.createElement('canvas')
  c.width = SW
  c.height = SH
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ddd2b4'
  ctx.fillRect(0, 0, SW, SH)
  // pauta clara
  ctx.fillStyle = 'rgba(120, 100, 70, 0.18)'
  for (let y = 70; y < SH - 20; y += 22) ctx.fillRect(18, y, SW - 36, 1)
  ctx.fillStyle = '#1c150e'
  ctx.textBaseline = 'alphabetic'
  if (!s) {
    ctx.textAlign = 'center'
    ctx.font = `38px ${BODY}`
    ctx.fillText('Nova folha', SW / 2, 130)
    ctx.font = `110px ${BODY}`
    ctx.fillText('+', SW / 2, 240)
    ctx.font = `22px ${BODY}`
    ctx.fillStyle = '#463b2c'
    ctx.fillText('toque para escrever', SW / 2, 290)
  } else {
    ctx.font = `30px ${BODY}`
    wrap(ctx, s.t || 'Sem título', SW - 40, 2).forEach((l, i) => ctx.fillText(l, 20, 48 + i * 32))
    ctx.font = `20px ${BODY}`
    ctx.fillStyle = '#2c2318'
    wrap(ctx, s.x.replace(/\s+/g, ' ').trim().slice(0, 240), SW - 40, 9).forEach((l, i) => ctx.fillText(l, 20, 120 + i * 22))
    ctx.fillStyle = '#8a3a46'
    ctx.fillText(`rascunho · ${words(s.x)} palavras`, 20, SH - 22)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function Sheet({ geometry, story, slot, layer, onOpen, pbr }: {
  geometry: THREE.BufferGeometry
  story: Story | null
  slot: [number, number, number]
  layer: number
  onOpen: (id: string | null) => void
  pbr: { roughnessMap: THREE.Texture; normalMap: THREE.Texture }
}) {
  const [fonts, setFonts] = useState(false)
  useEffect(() => {
    loadPageFonts().then(() => setFonts(true))
  }, [])
  const key = story ? `${story.id}|${story.t}|${story.u}` : 'nova'
  const map = useMemo(() => sheetArt(story), [key, fonts]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => map.dispose(), [map])
  const id = 'folha:' + (story ? story.id : 'nova')
  const hovered = useHovered(id)
  return (
    <group>
    <mesh
      geometry={geometry}
      position={[slot[0], DESK.height + 0.0006 + layer * 0.0005, slot[1]]}
      rotation={[-Math.PI / 2, 0, slot[2]]}
      castShadow
      receiveShadow
      {...clickable(id, () => onOpen(story ? story.id : null))}
    >
      <meshStandardMaterial map={map} roughnessMap={pbr.roughnessMap} normalMap={pbr.normalMap} side={THREE.DoubleSide} />
    </mesh>
    {hovered && (
      // borda dourada da folha: linha fina em volta, logo acima do papel
      <lineLoop position={[slot[0], DESK.height + 0.0016 + layer * 0.0005, slot[1]]} rotation={[-Math.PI / 2, 0, slot[2]]} geometry={SHEET_EDGE} renderOrder={5}>
        <lineBasicMaterial color="#ffe6a8" />
      </lineLoop>
    )}
    </group>
  )
}

/** Tinteiro de vidro escuro com uma pena: clicar abre uma folha nova para escrever. */
function Inkwell({ onWrite }: { onWrite: () => void }) {
  const hovered = useHovered('tinteiro')
  const feather = useMemo(() => {
    // pena: haste fina com a barba larga no alto, levemente curva
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.016, 0.06, 0.008, 0.15)
    s.quadraticCurveTo(0.001, 0.17, -0.004, 0.15)
    s.quadraticCurveTo(-0.008, 0.08, 0, 0)
    return new THREE.ShapeGeometry(s, 12)
  }, [])
  return (
      <group position={[0.44, DESK.height, -1.07]} {...clickable('tinteiro', onWrite)}>
        {hovered && (
          <mesh position={[0, 0.002 + 0.034, 0]} material={outlineMaterial}>
            <cylinderGeometry args={[0.032, 0.036, 0.068, 24]} />
          </mesh>
        )}
        <mesh position={[0, 0.028, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.026, 0.03, 0.056, 32]} />
          <meshPhysicalMaterial color="#0b0d0c" roughness={0.08} metalness={0} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.062, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.014, 0.012, 24]} />
          <meshStandardMaterial color="#6e5430" metalness={1} roughness={0.45} />
        </mesh>
        {/* pena mergulhada no tinteiro, inclinada para trás */}
        <group position={[0, 0.05, 0]} rotation={[-0.32, 0.5, -0.22]}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.0011, 0.0016, 0.14, 6]} />
            <meshStandardMaterial color="#d8ccb0" roughness={0.7} />
          </mesh>
          <mesh geometry={feather} position={[0, 0.03, 0]} castShadow>
            <meshStandardMaterial color="#e9e1cf" roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
  )
}

/** Caixa de madeira com fichas, no canto da mesa: clicar abre o Acervo. */
function ArchiveBox({ onOpen }: { onOpen: () => void }) {
  const hovered = useHovered('caixa')
  const wood = usePbr('wood', [0.6, 0.4])
  const W = 0.15, H = 0.075, D = 0.105, T = 0.006
  const cards = [0, 1, 2, 3, 4, 5, 6]
  return (
      <group position={[-0.52, DESK.height, -1.09]} rotation={[0, 0.22, 0]} {...clickable('caixa', onOpen)}>
        {hovered && (
          <mesh position={[0, 0.002 + (H + 0.016) / 2, 0]} material={outlineMaterial}>
            <boxGeometry args={[W + 0.012, H + 0.016, D + 0.012]} />
          </mesh>
        )}
        {/* fundo e quatro paredes */}
        <mesh position={[0, T / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[W, T, D]} />
          <meshStandardMaterial color="#b08060" {...wood} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={'f' + k} position={[0, H / 2, (k * (D - T)) / 2]} castShadow receiveShadow>
            <boxGeometry args={[W, H, T]} />
            <meshStandardMaterial color="#b08060" {...wood} />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={'l' + k} position={[(k * (W - T)) / 2, H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[T, H, D - 2 * T]} />
            <meshStandardMaterial color="#b08060" {...wood} />
          </mesh>
        ))}
        {/* fichas em pé, pontas de fora */}
        {cards.map((i) => (
          <mesh key={i} position={[-W / 2 + 0.018 + i * 0.019, H - 0.012 + (i % 3) * 0.004, 0]} rotation={[0, 0, -0.12]} castShadow receiveShadow>
            <boxGeometry args={[0.0012, 0.06, D - 2 * T - 0.006]} />
            <meshStandardMaterial color={i % 2 ? '#d9cdb0' : '#cbbd9c'} roughness={0.9} />
          </mesh>
        ))}
        {/* plaquinha de latão na frente */}
        <mesh position={[0, H * 0.55, D / 2 + 0.0005]}>
          <planeGeometry args={[0.05, 0.016]} />
          <meshStandardMaterial color="#b08a48" metalness={1} roughness={0.35} />
        </mesh>
      </group>
  )
}

/** Folhas soltas (rascunhos), o tinteiro (escrever) e a caixa de fichas (acervo). */
export function Props({ stories, onOpenSheet, onLibrary }: { stories: Story[]; onOpenSheet: (id: string | null) => void; onLibrary: () => void }) {
  const paper = usePbr('paper', [0.7, 0.9])
  const sheet = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.15, 0.212, 16, 16)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i)
      // ondulação suave e canto levantado
      const lift = 0.0015 * Math.sin(x * 22) + Math.max(0, (x - 0.04) * (y - 0.07)) * 0.3
      p.setZ(i, lift)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const list = drafts(stories).slice(0, 5)
  return (
    <group>
      <Sheet geometry={sheet} story={null} slot={SLOTS[0]} layer={4} onOpen={onOpenSheet} pbr={paper} />
      {list.map((s, i) => (
        // o rascunho mais recente fica por cima da pilha
        <Sheet key={s.id} geometry={sheet} story={s} slot={SLOTS[i + 1]} layer={4 - i} onOpen={onOpenSheet} pbr={paper} />
      ))}
      <Inkwell onWrite={() => onOpenSheet(null)} />
      <ArchiveBox onOpen={onLibrary} />
    </group>
  )
}
