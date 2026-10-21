import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { atmosphere, noise1 } from '../atmosphere'
import { clickable, useHovered } from '../hover'
import { outlineMaterial } from '../outline'
import { CANDLE, DESK, FLAME_BASE_Y } from '../layout'
import { flameFragment, flameVertex } from '../shaders/flame'

const WAX_R = 0.0115

/** Castiçal de latão, vela com escorridos, chama por shader e a luz que ela projeta. Clicar abre os Ajustes. */
export function Candle({ onOpen }: { onOpen: () => void }) {
  const hovered = useHovered('vela')
  const light = useRef<THREE.PointLight>(null)
  const flameGroup = useRef<THREE.Group>(null)

  const waxGeom = useMemo(() => {
    // perfil da vela: corpo levemente irregular e topo derretido com borda
    const H = CANDLE.wax
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
    for (let i = 0; i <= 16; i++) {
      const y = (i / 16) * (H - 0.006)
      pts.push(new THREE.Vector2(WAX_R * (1 + 0.025 * Math.sin(i * 1.7) + (i < 2 ? 0.08 : 0)), y))
    }
    pts.push(new THREE.Vector2(WAX_R * 1.02, H - 0.002), new THREE.Vector2(WAX_R * 0.9, H), new THREE.Vector2(WAX_R * 0.6, H - 0.004), new THREE.Vector2(0.0015, H - 0.005), new THREE.Vector2(0, H - 0.005))
    const g = new THREE.LatheGeometry(pts, 40)
    // irregularidade em volta: a cera não é um cilindro perfeito
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const ang = Math.atan2(z, x)
      const k = 1 + 0.03 * noise1(ang * 2.5 + y * 40) + (y > H - 0.008 ? 0.06 * noise1(ang * 4) : 0)
      p.setXYZ(i, x * k, y, z * k)
    }
    g.computeVertexNormals()
    return g
  }, [])

  const holderGeom = useMemo(() => {
    const pts = [
      [0, 0], [0.048, 0], [0.052, 0.004], [0.05, 0.008], [0.046, 0.009], [0.02, 0.012], [0.016, 0.016], [0.015, 0.03], [0.018, 0.032], [0.0125, 0.032], [0.0125, 0.02], [0, 0.02],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(pts, 48)
  }, [])

  // escorridos de cera pelo lado da vela
  const drips = useMemo(
    () => [
      { a: 0.4, len: 0.035, r: 0.0022 },
      { a: 2.1, len: 0.06, r: 0.0026 },
      { a: 3.9, len: 0.022, r: 0.0018 },
      { a: 5.0, len: 0.045, r: 0.002 },
    ],
    [],
  )

  const waxMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#e7dcc6', roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#fff1d6') })
    // a cera deixa a luz da chama atravessar perto do topo (aproximação de translucidez)
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = { value: 1 }
      sh.uniforms.uTop = { value: CANDLE.wax }
      m.userData.shader = sh
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;\nuniform float uGlow;\nuniform float uTop;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.52, 0.2) * uGlow * (0.06 + 0.12 * smoothstep(0.0, uTop, vH) + 0.9 * smoothstep(uTop - 0.025, uTop, vH));')
    }
    return m
  }, [])

  const flameMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        uniforms: { uTime: { value: 0 }, uFlicker: { value: 1 }, uSway: { value: 0 }, uStretch: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  const flameGeom = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.02, 0.05)
    g.translate(0, 0.025 - 0.004, 0)
    return g
  }, [])

  useFrame(() => {
    const a = atmosphere
    flameMat.uniforms.uTime.value = a.time
    flameMat.uniforms.uFlicker.value = a.flicker
    flameMat.uniforms.uSway.value = a.sway
    flameMat.uniforms.uStretch.value = a.stretch
    const sh = waxMat.userData.shader as { uniforms: { uGlow: { value: number } } } | undefined
    if (sh) sh.uniforms.uGlow.value = a.flicker
    if (light.current) {
      // a luz fica no meio da chama e acompanha o balanço dela
      light.current.intensity = 0.95 * a.flicker * a.flicker
      light.current.position.set(CANDLE.x + a.sway * 0.004, FLAME_BASE_Y + 0.02 * a.stretch, CANDLE.z)
    }
  })

  return (
    <group>
      <group position={[CANDLE.x, DESK.height, CANDLE.z]} {...clickable('vela', onOpen)}>
        {hovered && (
          // filete dourado em volta do castiçal e da vela (2 mm acima da mesa, para não piscar)
          <group position={[0, 0.002, 0]}>
            <mesh position={[0, 0.017, 0]} material={outlineMaterial}>
              <cylinderGeometry args={[0.058, 0.058, 0.034, 32]} />
            </mesh>
            <mesh position={[0, 0.032 + CANDLE.wax / 2 + 0.002, 0]} material={outlineMaterial}>
              <cylinderGeometry args={[WAX_R + 0.006, WAX_R + 0.006, CANDLE.wax + 0.006, 20]} />
            </mesh>
          </group>
        )}
        <mesh geometry={holderGeom} castShadow receiveShadow>
          <meshStandardMaterial color="#8c6a3a" metalness={1} roughness={0.38} />
        </mesh>
        {/* alça do castiçal */}
        <mesh position={[0.052, 0.012, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.012, 0.0028, 12, 32]} />
          <meshStandardMaterial color="#8c6a3a" metalness={1} roughness={0.4} />
        </mesh>
        <group position={[0, 0.032, 0]}>
          <mesh geometry={waxGeom} material={waxMat} castShadow receiveShadow />
          {drips.map((d, i) => (
            <mesh key={i} position={[Math.cos(d.a) * WAX_R * 1.02, CANDLE.wax - d.len / 2 - 0.003, Math.sin(d.a) * WAX_R * 1.02]} material={waxMat}>
              <capsuleGeometry args={[d.r, d.len, 4, 10]} />
            </mesh>
          ))}
          {/* pavio */}
          <mesh position={[0, CANDLE.wax + 0.001, 0]} rotation={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.0007, 0.0009, 0.012, 6]} />
            <meshStandardMaterial color="#120c08" roughness={0.9} />
          </mesh>
        </group>
      </group>

      <group ref={flameGroup} position={[CANDLE.x, FLAME_BASE_Y, CANDLE.z]}>
        <Billboard lockX lockZ>
          <mesh geometry={flameGeom} material={flameMat} renderOrder={10} />
        </Billboard>
      </group>

      <pointLight
        ref={light}
        color="#ff9b4d"
        decay={2}
        distance={0}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-radius={3}
        shadow-normalBias={0.015}
        shadow-camera-near={0.005}
        shadow-camera-far={6}
      />
    </group>
  )
}
