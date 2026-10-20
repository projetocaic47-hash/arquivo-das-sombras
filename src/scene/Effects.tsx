import { Bloom, EffectComposer, N8AO, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'

/**
 * Pós-processamento mínimo: sombra de contato (AO), brilho só nas partes muito
 * claras (chama, raio), conversão de cor e vinheta. Não é usado para disfarçar
 * modelos; desligado no modo de qualidade baixa.
 */
export function Effects({ quality }: { quality: 'high' | 'low' }) {
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
