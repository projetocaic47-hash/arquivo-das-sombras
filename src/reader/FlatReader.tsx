import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { book } from '../book/controller'
import { spreadPages, type BookPage } from '../book/pages'
import type { Config } from '../data/types'
import { curlLeaf, type CurlParams } from '../scene/book/curl'
import { JERSEY_PX, PageTextures, PH, PW } from '../scene/book/pageArt'
import { paperMaterial, uniformsOf } from './paper'

// Leitura em tela cheia: as páginas do livro vistas de cima, ocupando a tela, em papel
// antigo. A folha que vira se curva e ondula como papel de verdade (curl.ts, o mesmo
// cálculo do livro 3D, com ondas). Com a tela em pé, uma página por vez: cada página
// vira sozinha. O estado (página atual, viradas, saltos) é o do livro (BookController).

const W = 1
const H = PH / PW
const COLS = 48
const ROWS = 28
const FOV = 24
/** amplitude das ondas do papel no ar, em radianos */
const RIPPLE = 0.16

/** Espaço livre entre as barras de botões, em pixels da tela. */
function freeRect(w: number, h: number) {
  let top = 0
  let bottom = 0
  let left = 0
  let right = 0
  for (const sel of ['.topbar', '.bookbar']) {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    if (!r || !r.width || !r.height) continue
    if (r.width >= r.height) {
      if (r.top < h / 2) top = Math.max(top, r.bottom + 6)
      else bottom = Math.max(bottom, h - r.top + 6)
    } else if (r.left < w / 2) left = Math.max(left, r.right + 6)
    else right = Math.max(right, w - r.left + 6)
  }
  return { x: left, y: top, w: Math.max(100, w - left - right), h: Math.max(100, h - top - bottom) }
}

/**
 * Uma página por vez quando duas páginas lado a lado ficariam bem menores que uma só:
 * tela em pé (celular, tablet em pé). Usado também pelo app antes de a leitura abrir.
 */
export function readerSingle(w = innerWidth, h = innerHeight) {
  const free = { w: w - 24, h: Math.max(200, h - 130) }
  return free.w / free.h < ((2 * W) / H) * 0.85
}

/** Malha da folha: grade com a frente para cima quando deitada. */
function leafGeometry() {
  const g = new THREE.BufferGeometry()
  const n = (COLS + 1) * (ROWS + 1)
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
  pos.setUsage(THREE.DynamicDrawUsage)
  const uv = new Float32Array(n * 2)
  for (let j = 0; j <= ROWS; j++)
    for (let i = 0; i <= COLS; i++) {
      const k = j * (COLS + 1) + i
      uv[k * 2] = i / COLS
      uv[k * 2 + 1] = 1 - j / ROWS
    }
  const idx: number[] = []
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i
      const b = a + 1
      const c = a + COLS + 1
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  g.setAttribute('position', pos)
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

const blank = (() => {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  t.needsUpdate = true
  return t
})()

/** Texto das páginas à vista, para leitores de tela (o desenho no canvas não é lido). */
function pageText(p: BookPage | undefined) {
  if (!p) return ''
  if (p.k === 'endpaper') return ''
  if (p.k === 'toc') return 'Índice. ' + p.entries.map((e) => `${e.title}, página ${e.page}`).join('. ')
  return (p.first ? p.title + '. ' + (p.sub ? p.sub + '. ' : '') : '') + (p.drop?.letter || '') + p.lines.map((l) => l.t).join(' ')
}

function Scene({ config }: { config: Config }) {
  const snap = useSyncExternalStore(book.subscribe, book.getSnapshot)
  const { size, camera, gl, viewport } = useThree()
  const dpr = viewport.dpr
  const textures = useMemo(() => new PageTextures(config, true), []) // eslint-disable-line react-hooks/exhaustive-deps
  const single = snap.single
  const pages = snap.pages

  // enquadramento: as páginas ocupam o espaço entre as barras
  const fit = useMemo(() => {
    const r = freeRect(size.width, size.height)
    const cw = single ? W : 2 * W
    const k = Math.min((r.w * 0.97) / cw, (r.h * 0.97) / H)
    return { r, k, cx: single ? W / 2 : 0 }
  }, [size.width, size.height, single])

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = FOV
    const d = size.height / fit.k / (2 * Math.tan((FOV * Math.PI) / 360))
    cam.up.set(0, 0, -1)
    cam.position.set(fit.cx, d, 0)
    cam.lookAt(fit.cx, 0, 0)
    cam.near = d * 0.3
    cam.far = d * 3
    const ox = size.width / 2 - (fit.r.x + fit.r.w / 2)
    const oy = size.height / 2 - (fit.r.y + fit.r.h / 2)
    cam.setViewOffset(size.width, size.height, Math.round(ox), Math.round(oy), size.width, size.height)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, fit])

  // nitidez: a textura tem o tamanho da página na tela, com os pixels da letra inteiros
  const texScale = useMemo(() => {
    const px = fit.k * H * dpr
    const font = textures.font
    const n = Math.max(2, Math.round(((px / PH) * font) / JERSEY_PX))
    const s = (n * JERSEY_PX) / font
    return Math.min(s, 4096 / PH)
  }, [fit.k, dpr, textures, config.fs]) // eslint-disable-line react-hooks/exhaustive-deps
  const artKey = JSON.stringify([config.n, config.p, config.fs, config.bm || [], texScale])
  useEffect(() => textures.set(pages, config, texScale), [textures, pages, artKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const grid = useMemo(() => {
    const fpx = textures.font / JERSEY_PX
    return new THREE.Vector2(Math.round(PW / fpx), Math.round(PH / fpx))
  }, [textures, artKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const mats = useMemo(
    () => ({ left: paperMaterial(), right: paperMaterial(), front: paperMaterial(THREE.FrontSide), back: paperMaterial(THREE.BackSide) }),
    [],
  )
  const leafGeo = useMemo(() => leafGeometry(), [])
  const leafRef = useRef<THREE.Group>(null)
  const leftRef = useRef<THREE.Mesh>(null)
  const rightRef = useRef<THREE.Mesh>(null)
  const phase = useRef(0)
  const prm = useMemo<CurlParams>(() => ({ width: W, height: H, cols: COLS, rows: ROWS, rightHeight: 0, leftHeight: 0, gutter: 0.05, ripple: RIPPLE }), [])

  // o que cada parte mostra: páginas paradas e a folha que vira
  const t = book.turn
  const view = useMemo(() => {
    if (single) {
      const cur = book.page
      if (t?.page) {
        const leafPage = t.dir === 1 ? t.from : t.from - 1
        return { left: -1, right: t.dir === 1 ? t.from + 1 : t.from, front: leafPage, back: leafPage, bleed: true }
      }
      return { left: -1, right: cur, front: -1, back: -1, bleed: false }
    }
    if (t && !t.page) {
      const L = t.dir === 1 ? t.from : t.from - 1
      return { left: spreadPages(L)[0], right: spreadPages(L + 1)[1], front: 2 * L - 1, back: 2 * L, bleed: false }
    }
    const [l, r] = spreadPages(Math.max(1, snap.spread))
    return { left: l, right: r, front: -1, back: -1, bleed: false }
  }, [single, t, t?.from, t?.dir, snap.spread, snap.side, snap.turning]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tex = (i: number) => (i >= 0 && i < pages.length ? textures.get(i) : blank)
    const set = (m: THREE.ShaderMaterial, i: number, gutter: number, flip = 0, alpha = 1) => {
      const u = uniformsOf(m)
      u.uInk.value = tex(i)
      u.uInkAlpha.value = alpha
      u.uSeed.value = (i + 3) * 0.731
      u.uGutter.value = gutter
      u.uFlipU.value = flip
      u.uGrid.value = grid
    }
    set(mats.left, view.left, -1)
    set(mats.right, view.right, 1)
    if (view.front >= 0) {
      set(mats.front, view.front, 1)
      // uma página por vez: o verso da folha é o mesmo papel, com a tinta da frente vazando de leve
      if (view.bleed) set(mats.back, view.front, -1, 1, 0.07)
      else set(mats.back, view.back, -1, 1)
    }
    // a próxima página já fica pronta, para a virada não engasgar
    const ahead = single ? book.page + 1 : 2 * Math.max(1, snap.spread)
    for (const i of [ahead, ahead + 1]) if (i < pages.length) textures.get(i)
  }, [view, pages, artKey, grid, mats, textures, single, snap.spread])

  // a leitura em tela cheia passa a animar o livro (o quarto 3D pode parar de desenhar)
  useEffect(() => {
    book.flat = true
    return () => {
      book.flat = false
    }
  }, [])

  useFrame((_, dt) => {
    book.update(dt)
    phase.current += dt * 2.2
    const tt = book.turn
    const leaf = leafRef.current!
    const isPageTurn = !!tt?.page
    leaf.visible = !!tt && isPageTurn === single
    const ru = uniformsOf(mats.right)
    const lu = uniformsOf(mats.left)
    ru.uShadowAmt.value = 0
    lu.uShadowAmt.value = 0
    if (!tt || !leaf.visible) return
    prm.phase = phase.current
    const pos = leafGeo.attributes.position as THREE.BufferAttribute
    curlLeaf(pos.array as Float32Array, tt.p, prm, 0.002)
    pos.needsUpdate = true
    leafGeo.computeVertexNormals()
    leafGeo.computeBoundingSphere()
    const row = (ROWS / 2) * (COLS + 1) * 3
    let maxX = 0
    let minX = 0
    for (let i = 0; i <= COLS; i++) {
      const x = pos.array[row + i * 3]
      maxX = Math.max(maxX, x)
      minX = Math.min(minX, x)
    }
    const s = Math.sin(Math.PI * tt.p)
    ru.uShadowEdge.value = maxX
    ru.uShadowSide.value = 1
    ru.uShadowAmt.value = 0.45 * s * (1 - tt.p)
    lu.uShadowEdge.value = minX
    lu.uShadowSide.value = -1
    lu.uShadowAmt.value = 0.45 * s * tt.p
  })

  // ---- toque e mouse: tocar vira, arrastar leva a folha junto, o índice é clicável ----
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const tocAt = (clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera)
    const meshes = [rightRef.current!, leftRef.current!].filter((m) => m.visible)
    const hit = ray.intersectObjects(meshes, false)[0]
    if (!hit?.uv || book.turn) return undefined
    const index = hit.object === rightRef.current ? view.right : view.left
    if (pages[index]?.k !== 'toc') return undefined
    return textures.tocAt(index, (1 - hit.uv.y) * PH)
  }
  const fitRef = useRef(fit)
  fitRef.current = fit
  const tocRef = useRef(tocAt)
  tocRef.current = tocAt

  useEffect(() => {
    const el = gl.domElement
    let d: { x: number; y: number; started: boolean; dir: 1 | -1; lastP: number; lastT: number; vel: number } | null = null
    const span = () => fitRef.current.k * W * 1.1
    const down = (e: PointerEvent) => {
      if (e.button > 0) return
      d = { x: e.clientX, y: e.clientY, started: false, dir: 1, lastP: 0, lastT: performance.now(), vel: 0 }
    }
    const move = (e: PointerEvent) => {
      if (!d) {
        if (e.pointerType === 'mouse') el.style.cursor = tocRef.current(e.clientX, e.clientY) !== undefined ? 'pointer' : ''
        return
      }
      const dx = e.clientX - d.x
      if (!d.started) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return
        d.dir = dx < 0 ? 1 : -1
        if (!book.beginDrag(d.dir)) {
          d = null
          return
        }
        d.started = true
        d.lastP = d.dir === 1 ? 0 : 1
        el.setPointerCapture?.(e.pointerId)
      }
      const a = Math.min(1, Math.max(0, (d.dir === 1 ? -dx : dx) / span()))
      const p = d.dir === 1 ? a : 1 - a
      const now = performance.now()
      d.vel = d.vel * 0.6 + ((p - d.lastP) / (Math.max(1, now - d.lastT) / 1000)) * 0.4
      d.lastP = p
      d.lastT = now
      book.dragTo(p)
    }
    const up = (e: PointerEvent) => {
      const g = d
      d = null
      if (!g) return
      if (g.started) return book.endDrag(g.vel)
      const toc = tocRef.current(e.clientX, e.clientY)
      if (toc !== undefined) return book.goToPage(toc)
      const r = fitRef.current.r
      book.step(e.clientX >= r.x + r.w / 2 ? 1 : -1)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl, ray])

  const boardW = (single ? W : 2 * W) + 0.05
  return (
    <>
      {/* capa de couro por baixo das folhas, aparecendo nas bordas */}
      <mesh position={[single ? W / 2 - 0.0125 : 0, -0.012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[boardW, H + 0.05]} />
        <meshBasicMaterial color="#4a1a22" />
      </mesh>
      <mesh ref={leftRef} visible={!single} position={[-W / 2, -0.002, 0]} rotation-x={-Math.PI / 2} material={mats.left}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh ref={rightRef} position={[W / 2, -0.002, 0]} rotation-x={-Math.PI / 2} material={mats.right}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <group ref={leafRef} visible={false}>
        <mesh geometry={leafGeo} material={mats.front} />
        <mesh geometry={leafGeo} material={mats.back} />
      </group>
    </>
  )
}

export function FlatReader({ config }: { config: Config }) {
  const snap = useSyncExternalStore(book.subscribe, book.getSnapshot)
  const visible = snap.single ? [book.page] : spreadPages(Math.max(1, snap.spread))
  const text = snap.turning ? '' : visible.map((i) => pageText(snap.pages[i])).join(' ')
  return (
    <div className="flat-reader">
      <Canvas
        className="flat-canvas"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NoToneMapping }}
        camera={{ fov: FOV, position: [0, 4, 0] }}
        aria-hidden="true"
      >
        <Scene config={config} />
      </Canvas>
      <div className="sr-only" aria-live="polite">
        {text}
      </div>
    </div>
  )
}
