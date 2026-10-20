import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { atmosphere, updateAtmosphere } from './atmosphere'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import type { Config, Story } from '../data/types'
import { BookContent } from './book/BookContent'
import { BookModel } from './book/BookModel'
import { Candle } from './objects/Candle'
import { Desk } from './objects/Desk'
import { Props } from './objects/Props'
import { Room } from './objects/Room'
import { Smoke } from './objects/Smoke'
import { pixelSize, STYLE } from './style'
import { Window } from './objects/Window'

/** Atualiza vela e relâmpago antes de qualquer outro objeto no quadro. */
function AtmosphereDriver() {
  useFrame((state, dt) => updateAtmosphere(state.clock.elapsedTime, dt), -1)
  return null
}

/** O quarto: mesa, janela com chuva, vela e livro fechado (Fase 3), no estilo definido em style.ts. */
export function SceneRoot({ onReady, onLost, stories, config, onOpenSheet, onLibrary, onSettings }: {
  onReady?: () => void
  /** a placa de vídeo foi liberada pelo navegador (true) ou voltou (false) */
  onLost?: (lost: boolean) => void
  stories: Story[]
  config: Config
  onOpenSheet: (id: string | null) => void
  onLibrary: () => void
  onSettings: () => void
}) {
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [dpr, setDpr] = useState(STYLE === 'pixel' ? 1 / pixelSize(innerWidth, innerHeight) : 1.5)

  // no estilo pixel a resolução da arte acompanha o tamanho da janela, e é a mesma com o
  // livro aberto: o livro continua pixel art de perto
  useEffect(() => {
    if (STYLE !== 'pixel') return
    const on = () => setDpr(1 / pixelSize(innerWidth, innerHeight))
    on()
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])

  useEffect(() => {
    // calma pedida pelo sistema ou em Ajustes ("Reduzir animações"): vela, relâmpagos e câmera
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => (atmosphere.reducedMotion = mq.matches || !!config.rm)
    on()
    mq.addEventListener('change', on)
    // ?debug expõe o estado atmosférico para os testes visuais automáticos
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __atmos: typeof atmosphere }).__atmos = atmosphere
    return () => mq.removeEventListener('change', on)
  }, [config.rm])

  return (
    <Canvas
      className={'scene' + (STYLE === 'pixel' ? ' pixel' : '')}
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={dpr}
      camera={{ position: [0.02, 1.24, 0.72], fov: 46, near: 0.02, far: 120 }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.NoToneMapping }}
      aria-hidden="true"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', () => onLost?.(true))
        gl.domElement.addEventListener('webglcontextrestored', () => onLost?.(false))
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          // o estilo pixel já desenha poucos pixels; só o realista precisa baixar a resolução
          if (STYLE === 'pixel') return
          setDpr(1)
          setQuality('low')
        }}
      />
      <color attach="background" args={['#020203']} />
      <AtmosphereDriver />
      <CameraRig />
      {/* luz rebatida muito fraca: evita preto absoluto nas áreas fora da vela */}
      <hemisphereLight args={['#2a3350', '#2a1a10', 0.05]} />
      {/* luz rebatida pelo tampo e pelas folhas: aquece de leve a frente da mesa */}
      <pointLight position={[-0.1, 0.82, -0.55]} color="#ff9c5a" intensity={0.05} decay={2} distance={0} />
      {/* ambiente para reflexos de metais (latão, dourado), gerado aqui mesmo, sem arquivos externos */}
      <Environment resolution={64} environmentIntensity={0.18}>
        <Lightformer form="circle" intensity={6} color="#ffb070" position={[-0.25, 0.95, -1]} scale={0.25} />
        <Lightformer form="rect" intensity={0.6} color="#7f8fc0" position={[0, 1.6, -1.6]} scale={[0.9, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.15} color="#5a3a22" position={[0, 0.7, 1]} scale={[3, 1, 1]} rotation-y={Math.PI} />
      </Environment>
      <Suspense fallback={null}>
        <Room />
        <Desk />
        <Window />
        <Candle onOpen={onSettings} />
        <Smoke />
        <BookContent stories={stories} config={config} />
        <BookModel config={config} />
        <Props stories={stories} onOpenSheet={onOpenSheet} onLibrary={onLibrary} />
        <Ready onReady={onReady} />
      </Suspense>
      <Effects quality={quality} style={STYLE} />
    </Canvas>
  )
}

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => onReady?.(), [onReady])
  return null
}
