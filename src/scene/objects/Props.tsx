import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { drafts, words } from '../../data/stories'
import type { Story } from '../../data/types'
import { DESK } from '../layout'
import { loadPageFonts } from '../book/pageArt'
import { usePbr } from '../textures'

// Folhas soltas sobre a mesa: os rascunhos mais recentes (como no original, até 5)
// e uma folha em branco para começar a escrever. Um clique abre o editor.

const SW = 256
const SH = 362
const BODY = `"Pixelify Sans", monospace`

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
    ctx.font = `600 30px ${BODY}`
    ctx.fillText('Nova folha', SW / 2, 130)
    ctx.font = `600 90px ${BODY}`
    ctx.fillText('+', SW / 2, 240)
    ctx.font = `600 17px ${BODY}`
    ctx.fillStyle = '#463b2c'
    ctx.fillText('toque para escrever', SW / 2, 290)
  } else {
    ctx.font = `600 24px ${BODY}`
    wrap(ctx, s.t || 'Sem título', SW - 40, 2).forEach((l, i) => ctx.fillText(l, 20, 48 + i * 28))
    ctx.font = `600 15px ${BODY}`
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
  return (
    <mesh
      geometry={geometry}
      position={[slot[0], DESK.height + 0.0006 + layer * 0.0005, slot[1]]}
      rotation={[-Math.PI / 2, 0, slot[2]]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        onOpen(story ? story.id : null)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <meshStandardMaterial map={map} roughnessMap={pbr.roughnessMap} normalMap={pbr.normalMap} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Folhas soltas (rascunhos) e um tinteiro de vidro escuro. */
export function Props({ stories, onOpenSheet }: { stories: Story[]; onOpenSheet: (id: string | null) => void }) {
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
      {/* tinteiro */}
      <group position={[0.44, DESK.height, -1.07]}>
        <mesh position={[0, 0.028, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.026, 0.03, 0.056, 32]} />
          <meshPhysicalMaterial color="#0b0d0c" roughness={0.08} metalness={0} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.062, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.014, 0.012, 24]} />
          <meshStandardMaterial color="#6e5430" metalness={1} roughness={0.45} />
        </mesh>
      </group>
    </group>
  )
}
