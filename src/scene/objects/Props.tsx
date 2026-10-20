import { useMemo } from 'react'
import * as THREE from 'three'
import { DESK } from '../layout'
import { usePbr } from '../textures'

/** Folhas soltas levemente curvadas e um tinteiro de vidro escuro. */
export function Props() {
  const paper = usePbr('paper', [0.7, 0.9])
  const sheet = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.21, 0.297, 16, 16)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i)
      // ondulação suave e canto levantado
      const lift = 0.002 * Math.sin(x * 18) + Math.max(0, (x - 0.06) * (y - 0.1)) * 0.25
      p.setZ(i, lift)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const sheets = [
    { x: -0.42, z: -0.74, r: 0.35 },
    { x: -0.38, z: -0.77, r: 0.12 },
    { x: 0.38, z: -0.78, r: -0.5 },
  ]
  return (
    <group>
      {sheets.map((s, i) => (
        <mesh key={i} geometry={sheet} position={[s.x, DESK.height + 0.0006 + i * 0.0004, s.z]} rotation={[-Math.PI / 2, 0, s.r]} castShadow receiveShadow>
          <meshStandardMaterial {...paper} side={THREE.DoubleSide} />
        </mesh>
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
