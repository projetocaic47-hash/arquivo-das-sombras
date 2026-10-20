import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphere } from '../atmosphere'
import { CANDLE, FLAME_BASE_Y } from '../layout'

// Fio de fumaça subindo da chama: estreito em baixo, abrindo e enrolando ao subir, até
// sumir. Cada ponto nasce na ponta da chama, sobe e se desfaz; a soma vira o fio.

const N = 140
const LIFE = 4.5 // segundos de cada ponto, do nascer ao sumir

const vertex = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying float vAge;
void main() {
  float age = fract(uTime / ${LIFE.toFixed(1)} + aSeed);
  vAge = age;
  float t = uTime * 0.5 + aSeed * 3.0;
  // sobe devagar, enrola e se desvia um pouco para o lado da janela aberta
  vec3 p = vec3(
    sin(age * 7.0 + t) * 0.014 * age + age * age * 0.035,
    age * 0.36,
    cos(age * 5.0 + t * 0.8) * 0.01 * age
  );
  vec4 mv = modelViewMatrix * vec4(position + p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.003, 0.03, sqrt(age));
  gl_PointSize = max(1.0, size * uScale / -mv.z);
}`

const fragment = /* glsl */ `
uniform float uLight;
varying float vAge;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  // aparece logo acima da chama, mais densa em baixo, e se desfaz ao subir
  float a = smoothstep(0.0, 0.08, vAge) * pow(1.0 - vAge, 1.6) * 0.2 * smoothstep(0.5, 0.1, d);
  // perto da chama a fumaça pega a luz quente; no alto fica cinza azulada
  vec3 col = mix(vec3(0.62, 0.45, 0.3) * uLight, vec3(0.3, 0.31, 0.34), smoothstep(0.0, 0.5, vAge));
  gl_FragColor = vec4(col, a);
}`

export function Smoke() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: N }, (_, i) => i / N), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.3)
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uScale: { value: 500 }, uLight: { value: 1 } },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  const clock = useMemo(() => ({ t: 0 }), [])
  useFrame((state, dt) => {
    // com "reduzir animações" a fumaça sobe bem mais devagar
    clock.t += Math.min(dt, 0.1) * (atmosphere.reducedMotion ? 0.35 : 1)
    mat.uniforms.uTime.value = clock.t
    mat.uniforms.uLight.value = atmosphere.flicker
    const cam = state.camera as THREE.PerspectiveCamera
    const h = state.gl.getDrawingBufferSize(new THREE.Vector2()).y
    mat.uniforms.uScale.value = h / 2 / Math.tan((cam.fov * Math.PI) / 360)
  })
  return <points geometry={geo} material={mat} position={[CANDLE.x, FLAME_BASE_Y + 0.05, CANDLE.z]} renderOrder={11} frustumCulled={false} />
}
