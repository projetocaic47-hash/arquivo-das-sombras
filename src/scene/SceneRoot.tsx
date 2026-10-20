import { Canvas } from '@react-three/fiber'

/**
 * Cena 3D vazia: apenas confirma que three.js e React Three Fiber iniciam
 * neste navegador. O quarto é construído na Fase 3.
 */
export function SceneRoot() {
  return (
    <Canvas
      className="scene"
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 2.4], fov: 40 }}
      gl={{ antialias: true }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      aria-hidden="true"
    >
      <color attach="background" args={['#050403']} />
      <ambientLight intensity={0.05} />
      <pointLight position={[0.3, 0.6, 0.2]} intensity={3} color="#ffb060" />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3, 2]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.85} />
      </mesh>
    </Canvas>
  )
}
