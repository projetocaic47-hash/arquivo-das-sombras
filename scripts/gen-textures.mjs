// Gera as texturas PBR do quarto por código (sem arquivos de terceiros, sem licença externa).
// Uso: node scripts/gen-textures.mjs   → grava em public/textures/
// Cada material tem: _albedo.jpg (cor, sRGB), _rough.jpg (rugosidade, linear), _normal.webp (relevo, linear).
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const OUT = new URL('../public/textures/', import.meta.url)
await mkdir(OUT, { recursive: true })

// ---------- ruído de gradiente periódico (tileável) ----------
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(seed) {
  const r = rng(seed)
  const perm = new Uint8Array(512)
  const p = [...Array(256).keys()]
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const gx = new Float32Array(256), gy = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2
    gx[i] = Math.cos(a)
    gy[i] = Math.sin(a)
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const mod = (a, n) => ((a % n) + n) % n
  // período em células da grade; 0 = sem repetição
  return function noise(x, y, px = 0, py = 0) {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const fx = x - x0, fy = y - y0
    const X0 = px ? mod(x0, px) : x0 & 255, Y0 = py ? mod(y0, py) : y0 & 255
    const X1 = px ? mod(x0 + 1, px) : (x0 + 1) & 255, Y1 = py ? mod(y0 + 1, py) : (y0 + 1) & 255
    const h = (X, Y) => perm[(perm[X & 255] + Y) & 511]
    const d = (hh, dx, dy) => gx[hh] * dx + gy[hh] * dy
    const n00 = d(h(X0, Y0), fx, fy), n10 = d(h(X1, Y0), fx - 1, fy)
    const n01 = d(h(X0, Y1), fx, fy - 1), n11 = d(h(X1, Y1), fx - 1, fy - 1)
    const u = fade(fx), v = fade(fy)
    return (n00 + u * (n10 - n00) + v * (n01 - n00 + u * (n11 - n01 - n10 + n00))) * 1.4
  }
}

/** fbm tileável: (u,v) em [0,1); fx,fy = células na 1ª oitava. Retorna ~[-1,1]. */
function fbm(noise, u, v, fx, fy, oct = 5, gain = 0.5, tile = true) {
  let s = 0, a = 1, n = 0, f = 1
  for (let o = 0; o < oct; o++) {
    s += a * noise(u * fx * f, v * fy * f, tile ? fx * f : 0, tile ? fy * f : 0)
    n += a
    a *= gain
    f *= 2
  }
  return s / n
}

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** Gera um material: fn(u,v) → {c:[r,g,b] 0..255, r: rugosidade 0..1, h: altura}. */
async function material(name, W, H, fn, { normalStrength = 2, tile = true } = {}) {
  const t0 = Date.now()
  const albedo = Buffer.alloc(W * H * 3)
  const rough = Buffer.alloc(W * H)
  const height = new Float32Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = fn((x + 0.5) / W, (y + 0.5) / H, x, y)
      const i = y * W + x
      albedo[i * 3] = clamp(s.c[0], 0, 255)
      albedo[i * 3 + 1] = clamp(s.c[1], 0, 255)
      albedo[i * 3 + 2] = clamp(s.c[2], 0, 255)
      rough[i] = clamp(s.r) * 255
      height[i] = s.h
    }
  // normal a partir da altura (Sobel), com borda contínua quando tileável
  const normal = Buffer.alloc(W * H * 3)
  const at = (x, y) => {
    if (tile) return height[((y + H) % H) * W + ((x + W) % W)]
    return height[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
      // convenção OpenGL (verde para cima), como o three.js espera
      let nx = -dx * normalStrength, ny = dy * normalStrength, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const i = (y * W + x) * 3
      normal[i] = (nx * 0.5 + 0.5) * 255
      normal[i + 1] = (ny * 0.5 + 0.5) * 255
      normal[i + 2] = (nz * 0.5 + 0.5) * 255
    }
  const base = (s) => new URL(`${name}_${s}`, OUT).pathname
  await sharp(albedo, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(base('albedo.jpg'))
  await sharp(rough, { raw: { width: W, height: H, channels: 1 } }).jpeg({ quality: 85 }).toFile(base('rough.jpg'))
  await sharp(normal, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 92 }).toFile(base('normal.webp'))
  console.log(`${name}: ${W}x${H} em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

// ---------- madeira ----------
/**
 * Madeira escura envelhecida. (u,v) em [0,1) sobre uma peça de lenM × widM metros;
 * as fibras correm ao longo de u. Frequências inteiras → tileável quando tile = true.
 */
function woodSample(nz, u, v, lenM, widM, board, tile) {
  const F = (m, k) => Math.max(1, Math.round(m * k))
  // variação larga de tom e deformação das linhas de crescimento
  const warp = fbm(nz.a, u, v, F(lenM, 0.8), F(widM, 5), 4, 0.5, tile)
  const broad = fbm(nz.d, u, v, F(lenM, 1.5), F(widM, 3), 4, 0.55, tile)
  // linhas de crescimento finas (~3 mm), deformadas; baixo contraste
  const ph = v * widM * 2000 + warp * 18 + board.phase
  const growth = 0.5 + 0.5 * Math.sin(ph)
  const late = smooth(0.55, 0.95, growth) // lenho tardio, mais escuro
  // fibras longas e poros
  const fiber = fbm(nz.b, u, v, F(lenM, 8), F(widM, 300), 3, 0.55, tile)
  const pores = smooth(0.3, 0.65, fbm(nz.c, u, v, F(lenM, 60), F(widM, 900), 2, 0.5, tile))
  const dark = hex('#1f140c'), mid = hex('#3d2716'), light = hex('#573822')
  let c = mix3(mid, light, clamp(0.5 + broad * 0.9 + fiber * 0.35))
  c = mix3(c, dark, late * 0.45 + clamp(-broad * 1.2) * 0.35)
  c = c.map((q) => q * (0.85 + 0.3 * board.tone) * (1 - pores * 0.22))
  return { c, rings: late, fiber, pores, blotch: broad }
}

const woodNoise = (s) => ({ a: makeNoise(s), b: makeNoise(s + 1), c: makeNoise(s + 2), d: makeNoise(s + 3), e: makeNoise(s + 4) })

// Tampo da mesa: 1,40 m × 0,70 m, três tábuas ao longo do comprimento.
{
  const nz = woodNoise(11)
  const r = rng(7)
  const boards = [0, 1, 2].map(() => ({ phase: r() * 100, tone: 0.75 + r() * 0.45 }))
  const marks = [ // marcas de copo e manchas (u, v, raio em m)
    [0.18, 0.62, 0.035], [0.74, 0.3, 0.04], [0.81, 0.36, 0.033],
  ]
  await material('desk', 2048, 1024, (u, v) => {
    const x = u * 1.4, y = v * 0.7
    const bi = Math.min(2, Math.floor(v * 3))
    const s = woodSample(nz, u, (v * 3) % 1, 1.4, 0.7 / 3, boards[bi], false)
    const gapD = Math.abs(v * 3 - Math.round(v * 3)) / 3 * 0.7 // distância à junta em m
    const gap = Math.round(v * 3) > 0 && Math.round(v * 3) < 3 ? 1 - smooth(0.0006, 0.0022, gapD) : 0
    // desgaste: área clara e lisa na frente, onde se apoiam os braços
    const wear = smooth(0.45, 1.0, v) * smooth(0.0, 0.25, u) * smooth(1, 0.75, u) * (0.6 + 0.4 * fbm(nz.e, u, v, 4, 2, 3))
    let c = mix3(s.c, s.c.map((q) => q * 1.35), wear * 0.5)
    // riscos finos
    const scratch = Math.max(0, fbm(nz.e, u * 3, v * 0.2, 6, 120, 2, 0.5, false) - 0.55) * 4
    c = c.map((q) => q * (1 + scratch * 0.25))
    // marcas circulares
    let ring = 0
    for (const [mu, mv, mr] of marks) {
      const d = Math.hypot((u - mu) * 1.4, (v - mv) * 0.7)
      ring = Math.max(ring, smooth(0.004, 0, Math.abs(d - mr)) * 0.55)
    }
    c = c.map((q) => q * (1 - ring * 0.35) * (1 - gap * 0.75))
    const rough = 0.62 + s.fiber * 0.08 + s.pores * 0.12 - wear * 0.22 + gap * 0.3 + ring * 0.1
    const h = s.rings * 0.25 + s.fiber * 0.5 - s.pores * 0.6 - gap * 3 - scratch * 0.4
    return { c, r: rough, h }
  }, { normalStrength: 1.6, tile: false })
}

// Madeira das pernas, moldura da janela e outras peças: 1 m × 0,25 m tileável.
{
  const nz = woodNoise(31)
  const board = { phase: 3, tone: 0.9 }
  await material('wood', 1024, 256, (u, v) => {
    const s = woodSample(nz, u, v, 1, 0.25, board, true)
    const h = s.rings * 0.2 + s.fiber * 0.5 - s.pores * 0.5
    return { c: s.c.map((q) => q * 0.9), r: 0.6 + s.pores * 0.15 + s.fiber * 0.05, h }
  }, { normalStrength: 1.4 })
}

// Assoalho: 2 m × 2 m tileável, 14 tábuas.
{
  const nz = woodNoise(51)
  const r = rng(9)
  const N = 14
  const planks = [...Array(N)].map(() => ({ phase: r() * 100, tone: 0.55 + r() * 0.5, cut: r(), cut2: r() }))
  await material('floor', 2048, 2048, (u, v) => {
    const pi = Math.floor(u * N)
    const p = planks[pi]
    const across = (u * N - pi) // 0..1 dentro da tábua
    // emendas de topo em posições aleatórias (período 1 → tileável)
    const along = v
    const seg = ((along - p.cut + 1) % 1) < 0.55 ? 0 : 1
    const tone = seg ? p.tone * 0.9 : p.tone
    const s = woodSample(nz, along, (across + pi * 0.37 + seg * 0.11) % 1, 2, 0.143, { phase: p.phase + seg * 17, tone }, false)
    const side = 1 - smooth(0.0, 0.025, Math.min(across, 1 - across))
    const dEnd = Math.min(Math.abs(((along - p.cut + 1) % 1)), Math.abs(((along - p.cut + 1) % 1) - 0.55), 1 - ((along - p.cut + 1) % 1))
    const end = 1 - smooth(0.0, 0.0015, dEnd)
    const gap = Math.max(side, end)
    const dirt = clamp(fbm(nz.e, u, v, 6, 6, 4) * 1.5 + 0.2)
    let c = s.c.map((q) => q * 0.85 * (1 - gap * 0.85) * (1 - dirt * 0.25))
    const rough = 0.7 + dirt * 0.15 + gap * 0.2 + s.pores * 0.08
    const h = s.fiber * 0.5 + s.rings * 0.2 - gap * 3 - s.pores * 0.4
    return { c, r: rough, h }
  }, { normalStrength: 1.6 })
}

// ---------- reboco da parede: 2 m × 2 m tileável ----------
{
  const a = makeNoise(71), b = makeNoise(72), c2 = makeNoise(73), d = makeNoise(74)
  await material('plaster', 1024, 1024, (u, v) => {
    const big = fbm(a, u, v, 3, 3, 5, 0.55)
    const mid = fbm(b, u, v, 12, 12, 4, 0.5)
    const fine = fbm(c2, u, v, 90, 90, 3, 0.5)
    const crack = (1 - smooth(0.0, 0.012, Math.abs(fbm(d, u, v, 4, 4, 5, 0.55)))) * smooth(0.2, 0.5, fbm(a, u + 0.3, v, 2, 2, 3))
    const base = hex('#6d6255'), stain = hex('#463d33'), pale = hex('#80766a')
    let c = mix3(base, stain, smooth(-0.1, 0.5, big))
    c = mix3(c, pale, clamp(mid * 0.8) * 0.4)
    c = c.map((q) => q * (1 + fine * 0.08) * (1 - crack * 0.35 * smooth(0.1, 0.4, big + 0.3)))
    const h = big * 0.4 + mid * 0.6 + fine * 0.25 - crack * 0.8 * smooth(0.1, 0.4, big + 0.3)
    return { c, r: 0.88 + fine * 0.05, h }
  }, { normalStrength: 2.2 })
}

// ---------- couro da capa: 0,5 m × 0,5 m tileável ----------
{
  const a = makeNoise(91), b = makeNoise(92), c2 = makeNoise(93)
  await material('leather', 1024, 1024, (u, v) => {
    // rugas: ruído "ridged" (vales finos)
    let rid = 0, amp = 1, f = 10, n = 0
    for (let o = 0; o < 4; o++) {
      rid += amp * (1 - Math.abs(a(u * f, v * f, f, f)))
      n += amp
      amp *= 0.5
      f *= 2
    }
    rid /= n
    const pores = fbm(b, u, v, 160, 160, 2, 0.5)
    const wear = smooth(0.0, 0.6, fbm(c2, u, v, 3, 3, 4, 0.55) + 0.2)
    const deep = hex('#2a1410'), mid = hex('#4a231a'), worn = hex('#6a3a26')
    let c = mix3(deep, mid, smooth(0.45, 0.9, rid))
    c = mix3(c, worn, wear * 0.45)
    c = c.map((q) => q * (1 - smooth(0.2, 0.6, pores) * 0.15))
    return { c, r: 0.62 - wear * 0.2 + (1 - rid) * 0.15, h: rid * 0.8 - smooth(0.2, 0.6, pores) * 0.3 }
  }, { normalStrength: 2.4 })
}

// ---------- papel envelhecido: 0,3 m × 0,3 m tileável ----------
{
  const a = makeNoise(111), b = makeNoise(112), c2 = makeNoise(113)
  await material('paper', 1024, 1024, (u, v) => {
    const stain = fbm(a, u, v, 3, 3, 5, 0.6)
    const fiber = fbm(b, u, v, 180, 40, 2, 0.5) * 0.5 + fbm(b, v, u, 40, 180, 2, 0.5) * 0.5
    const speck = smooth(0.55, 0.75, fbm(c2, u, v, 120, 120, 2, 0.5))
    const base = hex('#cfc09d'), aged = hex('#a88f62')
    let c = mix3(base, aged, smooth(-0.05, 0.6, stain) * 0.7)
    c = c.map((q) => q * (1 + fiber * 0.06) * (1 - speck * 0.3))
    return { c, r: 0.82 + fiber * 0.05, h: fiber * 0.6 + stain * 0.2 }
  }, { normalStrength: 0.8 })
}
