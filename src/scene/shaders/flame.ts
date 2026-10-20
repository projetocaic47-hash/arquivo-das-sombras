// Chama da vela: forma de gota deformada por ruído que sobe, núcleo quente,
// borda alaranjada e base azulada. A intensidade e o balanço vêm do mesmo
// valor que controla a luz (atmosphere.flicker / sway / stretch).
export const flameVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uFlicker;
uniform float uSway;
uniform float uStretch;
varying vec2 vUv;

float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  // y: 0 na base do pavio, 1 no topo do quadro
  float y = vUv.y / (0.86 * uStretch);
  float x = vUv.x - 0.5;
  // o topo balança mais que a base; ondulações sobem pela chama
  float lick = (vnoise(vec2(y * 3.5 - uTime * 5.0, uTime * 0.7)) - 0.5) * 0.10 * y * y;
  x -= uSway * 0.22 * y * y + lick;
  // perfil de gota: largo embaixo, afilado em cima
  float w = 0.30 * pow(clamp(sin(3.1416 * pow(clamp(y, 0.0, 1.0), 0.55)), 0.0, 1.0), 0.9) * (1.0 - 0.25 * y);
  float d = abs(x) / max(w, 1e-3);
  float body = smoothstep(1.0, 0.55, d) * step(0.0, y) * smoothstep(1.02, 0.9, y);
  float core = smoothstep(0.75, 0.0, d) * smoothstep(0.05, 0.22, y) * smoothstep(0.85, 0.35, y);
  float base = smoothstep(0.22, 0.02, y) * smoothstep(1.1, 0.4, d) * step(0.0, y);
  vec3 edge = vec3(1.0, 0.36, 0.06) * 2.2;
  vec3 hot = vec3(1.0, 0.82, 0.52) * 9.0;
  vec3 blue = vec3(0.12, 0.25, 1.0) * 0.9;
  vec3 col = edge * body + hot * core;
  col = mix(col, blue, base * 0.7);
  // pavio escuro dentro da base
  float wick = smoothstep(0.03, 0.0, abs(x)) * smoothstep(0.16, 0.05, y);
  col *= 1.0 - wick * 0.8;
  float a = clamp(body + base * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col * uFlicker * a, a);
}
`
