// Vidro da janela com gotas de chuva e a paisagem externa, num único shader.
// A paisagem é calculada por raio de visão: o que está mais longe se desloca
// menos quando a câmera se move (paralaxe real). As gotas funcionam como lentes:
// desviam o raio e refletem a luz da vela.

export const windowVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

export const windowFragment = /* glsl */ `
uniform float uTime;
uniform float uLightning;
uniform float uBoltX;
uniform float uBoltSeed;
uniform vec3 uCandlePos;
uniform float uCandle;
uniform float uGlassZ;
varying vec3 vWorld;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

// ---------- gotas no vidro ----------
// Retorna (desvio x, desvio y, máscara da gota) e em trail a área limpa deixada pelo rastro.
vec3 slidingLayer(vec2 uv, float t, float scale, float seed, out float trail) {
  vec2 a = vec2(1.0, 3.2);                // células altas: a gota percorre a célula de cima a baixo
  vec2 g = uv * scale / a;
  vec2 id = floor(g);
  float n = h21(id + seed);
  g.y += t * (0.035 + n * 0.03) * 0.0 ;   // (deslocamento é feito pela posição da gota abaixo)
  vec2 st = fract(g) - 0.5;               // -0.5..0.5 dentro da célula
  float speed = 0.06 + n * 0.08;
  float tt = t * speed + n * 7.0;
  float f = fract(tt);
  float cycle = floor(tt);
  // "anda e para": a gota acelera e trava em pequenos trancos
  float y = 0.5 - (f + 0.06 * sin(f * 6.2831 * 3.0 + n * 6.0));
  y = clamp(y, -0.5, 0.5) * 0.92;
  float x = (h21(id + cycle + seed) - 0.5) * 0.6 + sin(f * 9.0 + n * 20.0) * 0.04 * (1.0 - f);
  vec2 p = (st - vec2(x, y)) * a;          // volta à proporção real
  float r = 0.075 + 0.06 * h21(id + cycle * 3.1 + seed);
  float life = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.86, f);
  r *= life;
  // forma de gota: base mais larga, topo afinado
  vec2 q = p; q.y *= 1.0 + 0.45 * smoothstep(-r, r, q.y);
  float d = length(q);
  float m = smoothstep(r, r * 0.75, d);
  vec2 nrm = (r > 0.001) ? q / r : vec2(0.0);
  // rastro de gotículas acima da gota
  float above = st.y - y;
  float tr = smoothstep(-0.02, 0.02, above) * smoothstep(0.0, 0.5 * life, 0.5 - st.y) ;
  float tw = 1.0 - smoothstep(0.0, 0.02 * life + 1e-4, abs(st.x - x));
  trail = tr * tw * life;
  vec2 dropletCell = vec2(st.x - x, fract(st.y * 9.0 + n) - 0.5);
  float droplet = smoothstep(0.022, 0.008, length(dropletCell * vec2(1.0, 0.35))) * trail * step(0.03, above);
  vec2 dn = dropletCell / 0.03 * droplet;
  return vec3(nrm * m + dn * 0.6, max(m, droplet));
}

vec3 staticDrops(vec2 uv, float t, float scale) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  vec2 o = h22(id) - 0.5;
  float n = h21(id + 3.7);
  float fade = sin(fract(t * 0.05 + n) * 3.1416); // surgem e somem devagar
  float r = (0.08 + 0.18 * n * n) * fade;
  vec2 p = st - o * 0.7;
  float d = length(p);
  float m = smoothstep(r, r * 0.6, d) * step(0.25, n);
  return vec3(p / max(r, 0.001) * m, m);
}

// ---------- paisagem externa ----------
vec3 sky(vec2 p) {
  // p: coordenadas no plano do céu (metros)
  float clouds = fbm(p * 0.035 + vec2(uTime * 0.004, 0.0));
  float c2 = fbm(p * 0.09 - vec2(uTime * 0.007, 0.0) + 4.0);
  vec3 base = mix(vec3(0.004, 0.0045, 0.009), vec3(0.010, 0.011, 0.022), smoothstep(-5.0, 25.0, p.y));
  base *= 0.6 + 0.9 * clouds;
  // brilho do relâmpago dentro das nuvens, concentrado perto do raio
  float bx = uBoltX * 40.0;
  float glow = exp(-abs(p.x - bx) * 0.04) * (0.4 + 0.8 * c2);
  // clarão contido abaixo do limiar do brilho, para não lavar as silhuetas
  base += vec3(0.30, 0.32, 0.46) * uLightning * (0.06 + glow * 0.7) * clouds * clouds * 1.4;
  // o raio: linha irregular e ramificada, visível só no clarão
  if (uLightning > 0.15) {
    float y = p.y;
    float jag = 0.0, amp = 6.0, fr = 0.05;
    for (int i = 0; i < 5; i++) { jag += (vnoise(vec2(y * fr, uBoltSeed + float(i) * 13.0)) - 0.5) * amp; amp *= 0.5; fr *= 2.2; }
    float dx = abs(p.x - bx - jag);
    float top = smoothstep(55.0, 40.0, y) * smoothstep(-2.0, 8.0, y);
    float core = exp(-dx * 4.0) * top;
    float halo = exp(-dx * 0.5) * top * 0.15;
    base += vec3(0.85, 0.88, 1.0) * (core * 4.0 + halo * 0.6) * uLightning;
  }
  return base;
}

vec3 treeLine(vec2 p, vec3 behind) {
  // silhuetas de árvores a ~14 m
  float hgt = 0.4 + fbm(vec2(p.x * 0.12, 1.0)) * 3.6 + fbm(vec2(p.x * 0.9, 7.0)) * 1.2 + fbm(vec2(p.x * 3.0 + uTime * 0.15 * sin(p.x), 3.0)) * 0.5;
  float leafy = fbm(p * 1.8 + vec2(sin(uTime * 0.6 + p.y) * 0.08, 0.0));
  float m = smoothstep(hgt + 0.35, hgt - 0.35, p.y + (leafy - 0.5) * 1.6);
  vec3 col = vec3(0.0006, 0.0007, 0.0011) + vec3(0.006, 0.007, 0.011) * uLightning * leafy;
  // chão ao longe
  float ground = smoothstep(0.6, 0.2, p.y);
  vec3 g = vec3(0.0008, 0.0009, 0.0012) + vec3(0.03, 0.033, 0.05) * uLightning;
  vec3 r = mix(behind, col, m);
  return mix(r, g, ground);
}

float rainStreaks(vec2 p, float scale, float speed, float seed) {
  vec2 g = vec2(p.x * scale, p.y * scale * 0.12 + uTime * speed);
  vec2 id = floor(g);
  vec2 st = fract(g);
  float n = h21(id + seed);
  float x = h11(id.x * 7.3 + seed);
  float line = smoothstep(0.035, 0.0, abs(st.x - x - (st.y - 0.5) * 0.06));
  float len = smoothstep(0.0, 0.3, st.y) * smoothstep(1.0, 0.55, st.y);
  return line * len * step(0.55, n);
}

vec3 outside(vec3 ro, vec3 rd) {
  // planos paralelos ao vidro: chuva perto (0,7 m), chuva longe (3 m), árvores (14 m), céu (70 m)
  float behind = -rd.z;
  vec3 pSky = ro + rd * (70.0 / behind);
  vec3 pTree = ro + rd * (14.0 / behind);
  vec3 col = sky(pSky.xy);
  col = treeLine(pTree.xy, col);
  vec3 rainCol = vec3(0.02, 0.022, 0.03) + vec3(0.6, 0.65, 0.8) * uLightning;
  vec3 pR2 = ro + rd * (3.0 / behind);
  col += rainCol * rainStreaks(pR2.xy, 9.0, 3.2, 1.0) * 0.18;
  vec3 pR1 = ro + rd * (0.7 / behind);
  col += rainCol * rainStreaks(pR1.xy, 4.0, 4.5, 7.0) * 0.12;
  return col;
}

void main() {
  vec3 V = normalize(vWorld - cameraPosition);
  vec2 uv = vWorld.xy;

  float tr1, tr2;
  vec3 a = slidingLayer(uv, uTime, 7.0, 1.0, tr1);
  vec3 b = slidingLayer(uv * 1.35 + 3.1, uTime * 0.9, 9.0, 5.0, tr2);
  vec3 s = staticDrops(uv, uTime, 34.0);
  vec2 n = a.xy + b.xy * 0.8 + s.xy * 0.5;
  float drop = clamp(a.z + b.z + s.z, 0.0, 1.0);
  float clear = clamp(drop + (tr1 + tr2) * 0.8, 0.0, 1.0);

  // a gota funciona como lente: inverte e amplia o que está atrás
  vec3 rd = normalize(V + vec3(-n * 0.35, 0.0));
  vec3 col = outside(vWorld, rd);

  // vidro antigo levemente embaçado: fora das gotas e rastros o fundo fica mais lavado
  float veil = (1.0 - clear) * 0.22;
  vec3 hazeCol = vec3(0.004, 0.0045, 0.007) + vec3(0.25, 0.27, 0.35) * uLightning * 0.3;
  // a luz da vela espalha no vidro embaçado
  vec3 toC = uCandlePos - vWorld;
  float dc = length(toC);
  vec3 warm = vec3(1.0, 0.55, 0.22) * uCandle * 0.004 / (dc * dc + 0.02);
  col = mix(col, hazeCol + warm, veil);
  col *= mix(0.92, 1.0, clear);

  // reflexo da chama no vidro: a vela espelhada atrás do plano do vidro
  vec3 mirrored = vec3(uCandlePos.xy, 2.0 * uGlassZ - uCandlePos.z);
  vec3 toM = normalize(mirrored - cameraPosition);
  vec3 rdR = normalize(V + vec3(n * 0.12, 0.0));
  float ang = acos(clamp(dot(rdR, toM), -1.0, 1.0));
  float fres = 0.04 + 0.96 * pow(1.0 - abs(V.z), 5.0);
  col += vec3(1.0, 0.62, 0.3) * uCandle * (smoothstep(0.004, 0.0, ang) * 2.5 + exp(-ang * 30.0) * 0.06) * fres * 6.0;

  // brilho especular da vela nas gotas
  vec3 N = normalize(vec3(n * 0.9, 1.0));
  vec3 L = normalize(toC);
  vec3 R = reflect(V, N);
  float spec = pow(max(dot(R, L), 0.0), 40.0) * drop;
  col += vec3(1.0, 0.6, 0.28) * spec * uCandle * 3.0;
  // corpo da gota: capta a luz quente difusa do quarto e tem borda clara do lado da vela
  col += warm * drop * 1.5;
  float rim = smoothstep(0.55, 0.95, length(n)) * drop * max(dot(normalize(n + 1e-4), normalize(toC.xy)), 0.0);
  col += vec3(1.0, 0.6, 0.3) * rim * uCandle * 0.02;
  // borda escura das gotas (refração total na borda)
  col *= 1.0 - smoothstep(0.6, 1.0, length(n)) * drop * 0.35;
  // reflexo frio do relâmpago nas gotas
  col += vec3(0.7, 0.75, 1.0) * drop * uLightning * 0.08;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
