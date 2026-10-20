import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import { PaletteEffect } from './shaders/palette'
import type { SceneStyle } from './style'

/**
 * Pós-processamento mínimo: sombra de contato (AO), brilho só nas partes muito
 * claras (chama, raio), conversão de cor e vinheta. Não é usado para disfarçar
 * modelos; desligado no modo de qualidade baixa.
 */
export function Effects({ quality, style }: { quality: 'high' | 'low'; style: SceneStyle }) {
  if (style === 'pixel') return <PixelEffects />
  if (quality === 'low') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1.2} intensity={0.6} />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.18} distanceFalloff={0.6} intensity={2.2} quality="medium" />
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={1.0} radius={0.75} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.25} darkness={0.75} />
      <Noise opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  )
}

/** Estilo pixel: brilho da chama, conversão de cor, vinheta e, por último, paleta com pontilhado. */
function PixelEffects() {
  const palette = useMemo(() => new PaletteEffect(), [])
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.2} intensity={0.9} radius={0.6} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.3} darkness={0.7} />
      <primitive object={palette} />
    </EffectComposer>
  )
}
