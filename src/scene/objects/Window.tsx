import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { atmosphere } from '../atmosphere'
import { CANDLE, FLAME_BASE_Y, WALL, WINDOW } from '../layout'
import { usePbr } from '../textures'
import { windowFragment, windowVertex } from '../shaders/windowView'

/** Janela de guilhotina com quatro vidros, peitoril e a luz fria que entra por ela. */
export function Window() {
  const wood = usePbr('wood', [1, 1])
  const woodV = usePbr('wood', [1, 1], Math.PI / 2)
  const { width: W, height: H, sill, cx } = WINDOW
  const zMid = WALL.z - WALL.thickness * 0.55 // vidro um pouco para fora do meio da parede
  const frame = 0.055 // largura da moldura
  const bar = 0.03 // travessas entre os vidros
  const spot = useRef<THREE.SpotLight>(null)

  const glass = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: windowVertex,
        fragmentShader: windowFragment,
        uniforms: {
          uTime: { value: 0 },
          uLightning: { value: 0 },
          uBoltX: { value: 0 },
          uBoltSeed: { value: 0 },
          uCandle: { value: 1 },
          uCandlePos: { value: new THREE.Vector3(CANDLE.x, FLAME_BASE_Y + 0.02, CANDLE.z) },
          uGlassZ: { value: zMid },
        },
      }),
    [zMid],
  )

  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(0.1, 0.4, -0.2)
    return o
  }, [])

  useFrame(() => {
    const a = atmosphere
    glass.uniforms.uTime.value = a.time
    glass.uniforms.uLightning.value = a.lightning
    glass.uniforms.uBoltX.value = a.boltX
    glass.uniforms.uBoltSeed.value = a.boltSeed
    glass.uniforms.uCandle.value = a.flicker
    if (spot.current) spot.current.intensity = 2.2 + a.lightning * 260
  })

  const innerW = W - frame * 2
  const innerH = H - frame * 2
  const paneW = (innerW - bar) / 2
  const paneH = (innerH - bar) / 2
  const y0 = sill + frame

  const piece = (key: string, x: number, y: number, w: number, h: number, d: number, vertical: boolean, z = zMid) => (
    <mesh key={key} position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial {...(vertical ? woodV : wood)} />
    </mesh>
  )

  return (
    <group>
      {/* vidros */}
      {[0, 1].map((ix) =>
        [0, 1].map((iy) => (
          <mesh
            key={`${ix}${iy}`}
            material={glass}
            position={[cx - innerW / 2 + paneW / 2 + ix * (paneW + bar), y0 + paneH / 2 + iy * (paneH + bar), zMid]}
          >
            <planeGeometry args={[paneW, paneH]} />
          </mesh>
        )),
      )}
      {/* moldura e travessas */}
      {piece('l', cx - W / 2 + frame / 2, sill + H / 2, frame, H, 0.06, true)}
      {piece('r', cx + W / 2 - frame / 2, sill + H / 2, frame, H, 0.06, true)}
      {piece('t', cx, sill + H - frame / 2, W, frame, 0.06, false)}
      {piece('b', cx, sill + frame / 2, W, frame, 0.06, false)}
      {piece('mv', cx, y0 + innerH / 2, bar, innerH, 0.04, true)}
      {piece('mh', cx, y0 + paneH + bar / 2, innerW, bar * 1.6, 0.05, false)}
      {/* peitoril interno */}
      {piece('sill', cx, sill - 0.012, W + 0.08, 0.024, WALL.thickness * 0.55 + 0.03, false, WALL.z - WALL.thickness * 0.275 + 0.015)}

      {/* luz fria da noite (e do relâmpago) entrando pela janela */}
      <primitive object={target} />
      <spotLight
        ref={spot}
        position={[cx + 0.5, sill + H + 1.6, WALL.z - 2.6]}
        target={target}
        color="#8d9fd6"
        angle={0.42}
        penumbra={0.7}
        decay={2}
        distance={0}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-radius={4}
        shadow-normalBias={0.02}
      />
    </group>
  )
}
