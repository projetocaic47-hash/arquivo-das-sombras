import { useMemo } from 'react'
import * as THREE from 'three'
import { usePbr } from '../textures'
import { ROOM, WALL, WINDOW } from '../layout'

/** Paredes de reboco, assoalho, teto e rodapé. A parede do fundo tem o vão da janela. */
export function Room() {
  const plaster = usePbr('plaster', [1.1, 1.1])
  const floor = usePbr('floor', [1, 1])
  const wood = usePbr('wood', [2, 1])

  const backWall = useMemo(() => {
    const { halfWidth: w, height: h } = ROOM
    const s = new THREE.Shape([new THREE.Vector2(-w, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, h), new THREE.Vector2(-w, h)])
    const x0 = WINDOW.cx - WINDOW.width / 2, x1 = WINDOW.cx + WINDOW.width / 2
    const y0 = WINDOW.sill, y1 = WINDOW.sill + WINDOW.height
    s.holes.push(new THREE.Path([new THREE.Vector2(x0, y0), new THREE.Vector2(x0, y1), new THREE.Vector2(x1, y1), new THREE.Vector2(x1, y0)]))
    const g = new THREE.ShapeGeometry(s)
    return g // UV = coordenadas em metros; textura cobre 2 m → repeat 0,5
  }, [])

  // faces internas do vão (espessura da parede)
  const reveal = useMemo(() => {
    const { width, height, sill, cx } = WINDOW
    const d = WALL.thickness
    return [
      { p: [cx - width / 2, sill + height / 2, WALL.z - d / 2], r: [0, Math.PI / 2, 0], s: [d, height] },
      { p: [cx + width / 2, sill + height / 2, WALL.z - d / 2], r: [0, -Math.PI / 2, 0], s: [d, height] },
      { p: [cx, sill + height, WALL.z - d / 2], r: [Math.PI / 2, 0, 0], s: [width, d] },
    ] as const
  }, [])

  const wallMat = <meshStandardMaterial {...plaster} normalScale={new THREE.Vector2(0.28, 0.28)} />

  return (
    <group>
      <mesh geometry={backWall} position={[0, 0, WALL.z]} receiveShadow>
        {wallMat}
      </mesh>
      {reveal.map((r, i) => (
        <mesh key={i} position={r.p as unknown as THREE.Vector3Tuple} rotation={r.r as unknown as THREE.Vector3Tuple} receiveShadow castShadow>
          <planeGeometry args={r.s as unknown as [number, number]} />
          {wallMat}
        </mesh>
      ))}
      {/* paredes laterais */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * ROOM.halfWidth, ROOM.height / 2, (WALL.z + ROOM.front) / 2]} rotation={[0, -side * Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM.front - WALL.z, ROOM.height]} />
          {wallMat}
        </mesh>
      ))}
      {/* assoalho */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (WALL.z + ROOM.front) / 2]} receiveShadow>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.front - WALL.z]} />
        <meshStandardMaterial {...floor} />
      </mesh>
      {/* teto */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height, (WALL.z + ROOM.front) / 2]}>
        <planeGeometry args={[ROOM.halfWidth * 2, ROOM.front - WALL.z]} />
        <meshStandardMaterial color="#2a241e" roughness={0.95} />
      </mesh>
      {/* rodapé */}
      <mesh position={[0, 0.06, WALL.z + 0.01]} castShadow receiveShadow>
        <boxGeometry args={[ROOM.halfWidth * 2, 0.12, 0.02]} />
        <meshStandardMaterial {...wood} />
      </mesh>
    </group>
  )
}
