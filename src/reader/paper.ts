import * as THREE from 'three'

// Papel antigo das páginas da leitura em tela cheia, desenhado no próprio shader: manchas
// de umidade com borda mais escura, pontinhos de ferrugem, fibras, bordas gastas e
// escurecidas, sombra da lombada. Tudo calculado numa grade do tamanho do pixel da letra,
// para o papel ter o mesmo pixel do texto. A tinta vem de uma textura transparente
// (PageTextures só com tinta) e é aplicada por cima, um pouco desbotada.

export interface PaperUniforms {
  [k: string]: THREE.IUniform
  uInk: THREE.IUniform<THREE.Texture | null>
  /** opacidade da tinta: 1 na frente, um vestígio no verso (a tinta vazando pelo papel) */
  uInkAlpha: THREE.IUniform<number>
  /** espelha a página na horizontal (verso da folha) */
  uFlipU: THREE.IUniform<number>
  uSeed: THREE.IUniform<number>
  /** quantos pixels de papel cabem na página (largura, altura) */
  uGrid: THREE.IUniform<THREE.Vector2>
  /** lombada à esquerda (1), à direita (−1) ou nenhuma (0) */
  uGutter: THREE.IUniform<number>
  /** sombra da folha que vira sobre esta página: borda da folha (x no mundo), força e lado */
  uShadowEdge: THREE.IUniform<number>
  uShadowAmt: THREE.IUniform<number>
  uShadowSide: THREE.IUniform<number>
}

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragment = /* glsl */ `
uniform sampler2D uInk;
uniform float uInkAlpha;
uniform float uFlipU;
uniform float uSeed;
uniform vec2 uGrid;
uniform float uGutter;
uniform float uShadowEdge;
uniform float uShadowAmt;
uniform float uShadowSide;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
float bayer4(vec2 c) {
  vec2 m = mod(c, 4.0);
  float x = m.x, y = m.y;
  float b = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - 4.0 * mod(x, 2.0) * mod(y, 2.0);
  float hi = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - 4.0 * floor(x / 2.0) * floor(y / 2.0);
  return (b * 4.0 + hi + 0.5) / 16.0;
}

void main() {
  vec2 uv = vUv;
  if (uFlipU > 0.5) uv.x = 1.0 - uv.x;
  vec2 cell = floor(uv * uGrid);
  vec2 q = (cell + 0.5) / uGrid;
  vec2 p = vec2(q.x, (1.0 - q.y) * 1.44) + uSeed * 3.17;

  // fundo: pergaminho com variação larga de tom
  float n1 = fbm(p * 2.6);
  float n2 = fbm(p * 8.0 + 5.0);
  vec3 col = mix(vec3(0.905, 0.845, 0.700), vec3(0.830, 0.735, 0.540), smoothstep(0.30, 0.85, n1));
  // manchas de umidade com a borda mais escura (marca de água seca)
  float st = fbm(p * 1.7 + 11.0);
  float stain = smoothstep(0.60, 0.68, st);
  float rim = smoothstep(0.585, 0.615, st) * (1.0 - smoothstep(0.62, 0.66, st));
  col = mix(col, col * vec3(0.88, 0.80, 0.64), stain * 0.38);
  col *= 1.0 - rim * 0.09;
  // pontinhos de ferrugem do papel velho
  float fox = smoothstep(0.80, 0.86, noise(p * 34.0)) * smoothstep(0.35, 0.75, n2);
  col = mix(col, vec3(0.62, 0.45, 0.28), fox * 0.45);
  // fibras na direção do papel e grão miúdo
  col *= 0.965 + 0.05 * noise(vec2(p.x * 3.0, p.y * 70.0));
  col *= 0.975 + 0.045 * hash(cell + uSeed);
  // bordas gastas, mais escuras e irregulares
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 1.44);
  float edge = 1.0 - smoothstep(0.0, 0.075, e + (n2 - 0.5) * 0.05);
  col = mix(col, vec3(0.46, 0.33, 0.19), edge * 0.62);
  // sombra da lombada
  if (uGutter != 0.0) {
    float g = uGutter > 0.0 ? uv.x : 1.0 - uv.x;
    col *= 0.72 + 0.28 * smoothstep(0.0, 0.14, g);
  }

  // tinta, um pouco desbotada onde o papel é mais gasto
  vec4 ink = texture2D(uInk, uv) * uInkAlpha;
  float fade = 0.86 + 0.14 * n2;
  col = col * (1.0 - ink.a) + ink.rgb * fade + col * ink.a * (1.0 - fade) * 0.5;

  // luz: o papel curvado fica mais claro ou mais escuro conforme a onda
  vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 L = normalize(vec3(-0.35, 1.0, -0.45));
  float diff = max(dot(N, L), 0.0);
  float light = 0.58 + 0.45 * diff;
  vec3 V = normalize(cameraPosition - vWorld);
  float sheen = pow(max(dot(reflect(-L, N), V), 0.0), 18.0) * 0.06;

  // sombra da folha que vira
  float d = (vWorld.x - uShadowEdge) * uShadowSide;
  float sh = uShadowAmt * (d < 0.0 ? 0.6 : exp(-d * d / 0.03));

  col = col * light * (1.0 - sh) + sheen;
  // poucos tons, com pontilhado, como o resto do quarto
  float levels = 28.0;
  col = floor(col * levels + bayer4(cell)) / levels;
  gl_FragColor = vec4(col, 1.0);
}
`

export function paperMaterial(side: THREE.Side = THREE.FrontSide) {
  const uniforms: PaperUniforms = {
    uInk: { value: null },
    uInkAlpha: { value: 1 },
    uFlipU: { value: 0 },
    uSeed: { value: 0 },
    uGrid: { value: new THREE.Vector2(133, 192) },
    uGutter: { value: 0 },
    uShadowEdge: { value: 0 },
    uShadowAmt: { value: 0 },
    uShadowSide: { value: 1 },
  }
  return new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side })
}

export const uniformsOf = (m: THREE.ShaderMaterial) => m.uniforms as PaperUniforms
