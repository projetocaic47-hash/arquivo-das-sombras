import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BOOK, DESK } from '../layout'
import { STYLE } from '../style'
import { usePbr } from '../textures'

/**
 * Livro fechado sobre a mesa (Fase 3). A versão que abre e vira páginas
 * substitui este componente na Fase 4.
 */
export function Book() {
  const leather = usePbr('leather', [1.6, 2.2])
  const { w, h, t } = BOOK
  const board = 0.0035 // espessura da capa
  const over = 0.003 // capa um pouco maior que o miolo
  const blockT = t - board * 2

  // bordas das folhas: linhas finas e irregulares, um pouco amareladas
  const edgeTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = '#b9a67f'
    g.fillRect(0, 0, 64, 512)
    for (let y = 0; y < 512; y += 2) {
      const v = 150 + Math.random() * 60
      g.fillStyle = `rgba(${v * 0.85},${v * 0.75},${v * 0.55},${0.25 + Math.random() * 0.4})`
      g.fillRect(0, y, 64, 1)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    return tex
  }, [])

  // título e moldura dourados gravados na capa
  const goldAlpha = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 700
    c.height = 1000
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#fff'
    g.lineWidth = 6
    g.strokeRect(46, 46, 608, 908)
    g.lineWidth = 2
    g.strokeRect(66, 66, 568, 868)
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.font = '600 64px Cinzel, Georgia, serif'
    g.fillText('ARQUIVO', 350, 420)
    g.font = '600 46px Cinzel, Georgia, serif'
    g.fillText('DAS', 350, 495)
    g.font = '600 64px Cinzel, Georgia, serif'
    g.fillText('SOMBRAS', 350, 580)
    g.font = '40px Georgia, serif'
    g.fillText('✦  ❖  ✦', 350, 320)
    g.fillText('✦  ❖  ✦', 350, 690)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.NoColorSpace
    return tex
  }, [])

  // couro vinho (cor da identidade) para o livro não se confundir com a madeira da mesa;
  // no estilo pixel a capa é de cor chapada, que lê melhor em poucos pixels
  const coverMat =
    STYLE === 'pixel' ? (
      <meshStandardMaterial color="#8a2c3c" roughness={0.6} />
    ) : (
      <meshStandardMaterial {...leather} color="#d0606e" normalScale={new THREE.Vector2(0.45, 0.45)} />
    )

  return (
    <group position={[BOOK.x, DESK.height, BOOK.z]} rotation={[0, BOOK.rotY, 0]}>
      {/* capa de baixo, miolo e capa de cima */}
      <RoundedBox args={[w + over, board, h + over * 2]} radius={0.0012} smoothness={2} position={[0, board / 2, 0]} castShadow receiveShadow>
        {coverMat}
      </RoundedBox>
      <mesh position={[over / 2, board + blockT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - over, blockT, h - over]} />
        <meshStandardMaterial map={edgeTex} roughness={0.85} />
      </mesh>
      <RoundedBox args={[w + over, board, h + over * 2]} radius={0.0012} smoothness={2} position={[0, t - board / 2, 0]} castShadow receiveShadow>
        {coverMat}
      </RoundedBox>
      {/* lombada arredondada */}
      <mesh position={[-w / 2 - over / 2 + 0.001, t / 2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.55, 1, 1]} castShadow receiveShadow>
        <cylinderGeometry args={[t / 2, t / 2, h + over * 2, 24, 1, false, Math.PI / 2, Math.PI]} />
        {coverMat}
      </mesh>
      {/* no estilo pixel, um filete dourado de cerca de 1 pixel em volta do livro, para destacá-lo da
          mesa escura: caixa um pouco maior, desenhada só por dentro (casca invertida) */}
      {STYLE === 'pixel' && (
        <mesh position={[-0.004, (t + 0.006) / 2, 0]}>
          <boxGeometry args={[w + over + 0.008 + 0.02, t + 0.006, h + over * 2 + 0.02]} />
          <meshBasicMaterial color="#e0b060" side={THREE.BackSide} />
        </mesh>
      )}
      {/* gravação dourada */}
      <mesh position={[0, t + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w * 0.92, h * 0.94]} />
        <meshStandardMaterial color="#c9a25a" metalness={1} roughness={0.4} envMapIntensity={4} emissive="#c5a059" emissiveIntensity={STYLE === 'pixel' ? 0.45 : 0} alphaMap={goldAlpha} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}
