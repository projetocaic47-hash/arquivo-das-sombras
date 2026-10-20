import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { atmosphere, noise1 } from './atmosphere'

const BASE = new THREE.Vector3(0.02, 1.24, 0.72)
const TARGET = new THREE.Vector3(0, 1.02, -1.2)

/** Câmera sentada diante da mesa, com respiração lenta e leve paralaxe do mouse. */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const pointer = useRef({ x: 0, y: 0 })
  const smooth = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / innerWidth - 0.5) * 2
      pointer.current.y = (e.clientY / innerHeight - 0.5) * 2
    }
    addEventListener('pointermove', onMove)
    return () => removeEventListener('pointermove', onMove)
  }, [])

  // em telas em pé, abre o ângulo para a mesa e a janela continuarem visíveis
  const size = useThree((s) => s.size)
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const hfov = 62 // graus, largura mínima desejada
    const v = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) / Math.PI
    cam.fov = Math.min(74, Math.max(46, v))
    cam.updateProjectionMatrix()
  }, [camera, size])

  useFrame((_, dt) => {
    const t = atmosphere.time
    const still = atmosphere.reducedMotion ? 0 : 1
    const k = 1 - Math.exp(-dt * 1.5)
    smooth.current.x += (pointer.current.x - smooth.current.x) * k
    smooth.current.y += (pointer.current.y - smooth.current.y) * k
    camera.position.set(
      BASE.x + still * (noise1(t * 0.13) * 0.012 + smooth.current.x * 0.05),
      BASE.y + still * (Math.sin(t * 0.45) * 0.004 + noise1(t * 0.11 + 9) * 0.008 - smooth.current.y * 0.025),
      BASE.z,
    )
    camera.lookAt(TARGET)
  })
  return null
}
