import { useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

const base = import.meta.env.BASE_URL + 'textures/'

/** Carrega as três texturas de um material gerado por scripts/gen-textures.mjs. */
export function usePbr(name: string, repeat: [number, number] = [1, 1], rotation = 0) {
  const [map, roughnessMap, normalMap] = useTexture([`${base}${name}_albedo.jpg`, `${base}${name}_rough.jpg`, `${base}${name}_normal.webp`])
  return useMemo(() => {
    // texturas compartilhadas pelo cache: clonar para poder repetir de formas diferentes
    const out = [map, roughnessMap, normalMap].map((t) => {
      const c = t.clone()
      c.wrapS = c.wrapT = THREE.RepeatWrapping
      c.repeat.set(repeat[0], repeat[1])
      c.rotation = rotation
      c.anisotropy = 8
      c.needsUpdate = true
      return c
    })
    out[0].colorSpace = THREE.SRGBColorSpace
    out[1].colorSpace = THREE.NoColorSpace
    out[2].colorSpace = THREE.NoColorSpace
    return { map: out[0], roughnessMap: out[1], normalMap: out[2] }
  }, [map, roughnessMap, normalMap, repeat[0], repeat[1], rotation])
}
