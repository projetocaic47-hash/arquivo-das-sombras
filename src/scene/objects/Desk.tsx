import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import { usePbr } from '../textures'
import { DESK } from '../layout'

/** Mesa de madeira escura com tampo de três tábuas, avental, gaveta e pernas torneadas simples. */
export function Desk() {
  const top = usePbr('desk')
  const wood = usePbr('wood', [1, 1])
  const woodV = usePbr('wood', [1, 1], Math.PI / 2)
  const { width: W, depth: D, height: H, top: T, z } = DESK
  const legH = H - T
  const apronH = 0.11
  const legs: [number, number][] = [[-W / 2 + 0.06, -D / 2 + 0.06], [W / 2 - 0.06, -D / 2 + 0.06], [-W / 2 + 0.06, D / 2 - 0.06], [W / 2 - 0.06, D / 2 - 0.06]]

  return (
    <group position={[0, 0, z]}>
      {/* tampo com cantos levemente gastos */}
      <RoundedBox args={[W, T, D]} radius={0.006} smoothness={3} position={[0, H - T / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...top} normalScale={new THREE.Vector2(0.9, 0.9)} />
      </RoundedBox>
      {/* avental */}
      <mesh position={[0, H - T - apronH / 2, D / 2 - 0.045]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.1, apronH, 0.022]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      <mesh position={[0, H - T - apronH / 2, -D / 2 + 0.045]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.1, apronH, 0.022]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (W / 2 - 0.045), H - T - apronH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.022, apronH, D - 0.1]} />
          <meshStandardMaterial {...wood} />
        </mesh>
      ))}
      {/* frente da gaveta e puxador de latão */}
      <mesh position={[0.18, H - T - apronH / 2, D / 2 - 0.032]} castShadow>
        <boxGeometry args={[0.42, apronH - 0.025, 0.008]} />
        <meshStandardMaterial {...wood} color="#d8c8b8" />
      </mesh>
      <mesh position={[0.18, H - T - apronH / 2, D / 2 - 0.022]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.008, 0.01, 0.014, 20]} />
        <meshStandardMaterial color="#8a6a3c" metalness={1} roughness={0.4} />
      </mesh>
      {/* pernas: torneadas por revolução */}
      {legs.map(([x, lz], i) => (
        <mesh key={i} position={[x, 0, lz]} castShadow receiveShadow>
          <latheGeometry args={[legProfile(legH), 24]} />
          <meshStandardMaterial {...woodV} />
        </mesh>
      ))}
    </group>
  )
}

function legProfile(h: number) {
  const pts: [number, number][] = [
    [0.0, 0], [0.018, 0], [0.02, 0.01], [0.017, 0.03], [0.015, 0.2], [0.019, 0.36], [0.016, 0.42],
    [0.022, 0.44], [0.022, 0.46], [0.018, 0.48], [0.024, h - apron() - 0.01], [0.024, h], [0, h],
  ]
  return pts.map(([r, y]) => new THREE.Vector2(r, y))
}
const apron = () => 0.11
