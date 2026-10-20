import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere } from '../atmosphere'
import { CANDLE, FLAME_BASE_Y } from '../layout'

// Poeira flutuando no ar parado do quarto (como no original): grãos quase invisíveis que
// só brilham quando passam perto da luz da vela, subindo e descendo muito devagar.

const N = 70
const BOX = { x: [-0.75, 0.75], y: [0.82, 1.55], z: [-1.18, -0.45] } as const

const vertex = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec3 uFlame;
attribute vec3 aSeed;
varying float vLight;
void main() {
  // cada grão passeia em volta do seu lugar, num ritmo próprio
  float t = uTime * (0.04 + 0.05 * aSeed.x);
  vec3 p = position + vec3(
    sin(t * 3.1 + aSeed.y * 6.28) * 0.05,
    sin(t * 1.7 + aSeed.z * 6.28) * 0.04 + fract(t * 0.2 + aSeed.x) * 0.03,
    cos(t * 2.3 + aSeed.x * 6.28) * 0.04
  );
  vec4 world = modelMatrix * vec4(p, 1.0);
  // brilha perto da chama, some longe dela
  float d = distance(world.xyz, uFlame);
  vLight = smoothstep(0.7, 0.1, d) * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed.y) + aSeed.z * 9.0));
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, 0.005 * uScale / -mv.z);
}`

const fragment = /* glsl */ `
uniform float uFlicker;
varying float vLight;
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5 || vLight < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * vLight * uFlicker * 1.8, 1.0);
}`

export function Dust() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const seed = new Float32Array(N * 3)
    // sorteio fixo (sempre o mesmo quarto a cada visita)
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = BOX.x[0] + rnd() * (BOX.x[1] - BOX.x[0])
      pos[i * 3 + 1] = BOX.y[0] + rnd() * (BOX.y[1] - BOX.y[0])
      pos[i * 3 + 2] = BOX.z[0] + rnd() * (BOX.z[1] - BOX.z[0])
      seed.set([rnd(), rnd(), rnd()], i * 3)
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 500 },
          uFlicker: { value: 1 },
          uFlame: { value: new THREE.Vector3(CANDLE.x, FLAME_BASE_Y + 0.03, CANDLE.z) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )
  const clock = useMemo(() => ({ t: 0 }), [])
  useFrame((state, dt) => {
    clock.t += Math.min(dt, 0.1) * (atmosphere.reducedMotion ? 0.3 : 1)
    mat.uniforms.uTime.value = clock.t
    mat.uniforms.uFlicker.value = atmosphere.flicker
    const cam = state.camera as THREE.PerspectiveCamera
    const h = state.gl.getDrawingBufferSize(new THREE.Vector2()).y
    mat.uniforms.uScale.value = h / 2 / Math.tan((cam.fov * Math.PI) / 360)
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}
