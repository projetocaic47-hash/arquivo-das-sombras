import { Effect } from 'postprocessing'
import * as THREE from 'three'

/**
 * Paleta da arte em pixel: sombras quase pretas, rampa quente da vela (madeira,
 * couro, cera, chama), vinho e dourado da identidade, e rampa fria da noite lá fora.
 */
export const PIXEL_PALETTE = [
  // escuros, levemente quentes para a sombra não puxar para o roxo
  '#040303', '#0a0706', '#120c0a', '#1b120e', '#241812',
  // rampa quente
  '#301e16', '#3f241a', '#58321e', '#764423', '#985a2a', '#bb7834', '#d99b45', '#efc066', '#fbe1a0', '#fff7e0',
  // vinho e dourado gasto
  '#5e2a35', '#8a3a46', '#7a6233', '#c5a059',
  // neutros de gesso e papel
  '#352d2a', '#544941', '#7d7062', '#a89a86', '#d5cabc',
  // rampa fria da noite
  '#0e1220', '#171e33', '#243049', '#384a6c', '#5a6f98', '#8fa3cc', '#cdd9f2',
]

const fragment = /* glsl */ `
uniform vec3 uPalette[${PIXEL_PALETTE.length}];
uniform float uSpread;

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int k = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[k]) + 0.5) / 16.0;
}

vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = toSrgb(clamp(inputColor.rgb, 0.0, 1.0));
  // pontilhado ordenado: desloca a cor antes de escolher a mais próxima da paleta
  // nas sombras profundas o pontilhado é mais fraco, para não virar chuvisco
  float luma = dot(c, vec3(0.30, 0.59, 0.11));
  c += (bayer4(gl_FragCoord.xy) - 0.5) * uSpread * mix(0.35, 1.0, smoothstep(0.02, 0.18, luma));
  vec3 best = uPalette[0];
  float bd = 1e9;
  for (int i = 0; i < ${PIXEL_PALETTE.length}; i++) {
    vec3 d = (c - uPalette[i]) * vec3(0.30, 0.59, 0.11);
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = uPalette[i]; }
  }
  outputColor = vec4(toLinear(best), inputColor.a);
}
`

export class PaletteEffect extends Effect {
  constructor(spread = 0.09) {
    const colors = PIXEL_PALETTE.map((h) => {
      const c = new THREE.Color(h)
      // THREE.Color guarda em linear; o shader compara em sRGB
      c.convertLinearToSRGB()
      return new THREE.Vector3(c.r, c.g, c.b)
    })
    super('PaletteEffect', fragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uPalette', new THREE.Uniform(colors)],
        ['uSpread', new THREE.Uniform(spread)],
      ]),
    })
  }
}
