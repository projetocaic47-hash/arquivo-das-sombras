import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { book } from '../../book/controller'
import { spreadPages } from '../../book/pages'
import type { Config } from '../../data/types'
import { BOOK, BOOK_OPEN, DESK, READ_HALF, READ_HALF_SINGLE } from '../layout'
import { clearHover, clickable, outlineMaterial, useHovered } from '../hover'
import { pixelSize, STYLE } from '../style'
import { curlLeaf, easeTurn, gutterDip, restAngle, restProfile, type CurlParams } from './curl'
import { JERSEY_PX, PageTextures, pageStyle, PH } from './pageArt'

// Medidas do livro (m). A lombada fica em x = 0 do grupo; a metade direita vai para +x.
const BOARD = 0.0035
const OVER = 0.003
export const PAGE_W = BOOK.w - OVER
export const PAGE_H = BOOK.h
const BLOCK = BOOK.t - BOARD * 2
const GUTTER = 0.04
const COLS = 48
const ROWS = 8
/** a folha que vira fica 0,4 mm acima das pilhas para nunca disputar o mesmo pixel com elas */
const LIFT = 0.0004
const SURFACE = 0.00025

/** espessura de cada folha: as folhas em branco do fim do livro completam o miolo */
const leafThickness = (last: number) => Math.min(0.0012, (BLOCK * 0.9) / Math.max(1, last))
const leftHeight = (spread: number, lt: number) => Math.max(0, spread - 1) * lt
const rightHeight = (spread: number, lt: number) => BLOCK - leftHeight(spread, lt)

/** Pose do livro (posição da lombada e giro), entre fechado no canto da mesa e aberto à frente. */
function bookPose(open: number) {
  const r = BOOK.rotY + (BOOK_OPEN.rotY - BOOK.rotY) * open
  // fechado: a lombada fica na borda esquerda do livro, cujo centro é BOOK
  const cx = BOOK.x - (Math.cos(BOOK.rotY) * BOOK.w) / 2
  const cz = BOOK.z + (Math.sin(BOOK.rotY) * BOOK.w) / 2
  return { x: cx + (BOOK_OPEN.x - cx) * open, z: cz + (BOOK_OPEN.z - cz) * open, r }
}

/** Ponto para onde a câmera olha ao ler: o meio da lombada aberta, no mundo. */
export function readingFocus() {
  return new THREE.Vector3(BOOK_OPEN.x, DESK.height + BOARD + BLOCK * 0.5, BOOK_OPEN.z)
}
export const READING_ROT_Y = BOOK_OPEN.rotY

/** Grade de uma superfície de página: posições da curva de repouso, uv da textura. */
function surfaceGeometry(cols: number, rows: number, mirror: boolean) {
  const g = new THREE.BufferGeometry()
  const n = (cols + 1) * (rows + 1)
  const uv = new Float32Array(n * 2)
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i
      // a lombada fica à esquerda da página da direita e à direita da página da esquerda
      uv[k * 2] = mirror ? 1 - i / cols : i / cols
      uv[k * 2 + 1] = 1 - j / rows
    }
  const idx: number[] = []
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i
      const b = a + 1
      const c = a + cols + 1
      const d = c + 1
      // frente voltada para cima quando a folha está deitada à direita
      if (mirror) idx.push(a, b, c, b, d, c)
      else idx.push(a, c, b, b, c, d)
    }
  g.setIndex(idx)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

/** Superfície em repouso sobre uma pilha de altura h; `side` −1 espelha para a esquerda. */
function restSurface(h: number, side: 1 | -1) {
  const g = surfaceGeometry(COLS, ROWS, side === -1)
  const prof = restProfile(h, PAGE_W, GUTTER, COLS)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let j = 0; j <= ROWS; j++)
    for (let i = 0; i <= COLS; i++) pos.setXYZ(j * (COLS + 1) + i, side * prof[i][0], prof[i][1] + SURFACE, -PAGE_H / 2 + (j / ROWS) * PAGE_H)
  g.computeVertexNormals()
  return g
}

/** Bloco de folhas (as bordas do papel) com o perfil curvo junto à lombada. */
function blockGeometry(h: number, side: 1 | -1) {
  if (h < 0.0002) return null
  const prof = restProfile(h, PAGE_W, GUTTER, 24)
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  for (const [x, y] of prof) s.lineTo(side * x, y)
  s.lineTo(side * prof[prof.length - 1][0], 0)
  s.closePath()
  const depth = PAGE_H - 0.004
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

const SPINE_SEG = 16

/** Lombada flexível: uma faixa curva que liga a contracapa à capa em qualquer ângulo de abertura. */
function spineGeometry() {
  const g = new THREE.BufferGeometry()
  const n = (SPINE_SEG + 1) * 2
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const idx: number[] = []
  for (let i = 0; i < SPINE_SEG; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  g.setIndex(idx)
  return g
}

/**
 * Junta de papel: a folha de guarda que liga o lado de dentro da capa ao miolo junto à lombada.
 * Vai da borda da página da esquerda (que gira com a capa) até a borda da página da direita,
 * saindo e chegando na direção de cada página, e cobre o vão entre a capa e as folhas.
 */
function updateJoint(g: THREE.BufferGeometry, angle: number, hingeY: number, hl: number, hr: number, length: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  // ponto e direção da página da esquerda junto à lombada, no grupo da capa, levados ao livro
  const ly = BOARD / 2 + hl - gutterDip(hl) + SURFACE
  const ax = -ly * s
  const ay = ly * c + hingeY
  const al = restAngle(0, hl, GUTTER)
  const tx0 = Math.cos(al)
  const ty0 = -Math.sin(al)
  const dx0 = tx0 * c - ty0 * s
  const dy0 = tx0 * s + ty0 * c
  // ponto e direção da página da direita junto à lombada
  const bx = 0
  const by = hr - gutterDip(hr) + SURFACE
  const ar = restAngle(0, hr, GUTTER)
  const dx1 = Math.cos(ar)
  const dy1 = Math.sin(ar)
  const k = Math.hypot(bx - ax, by - ay) * 0.4
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i <= SPINE_SEG; i++) {
    const t = i / SPINE_SEG
    const u = 1 - t
    const x = u * u * u * ax + 3 * u * u * t * (ax + dx0 * k) + 3 * u * t * t * (bx - dx1 * k) + t * t * t * bx
    const y = u * u * u * ay + 3 * u * u * t * (ay + dy0 * k) + 3 * u * t * t * (by - dy1 * k) + t * t * t * by
    pos.setXYZ(i * 2, x, y, -length / 2)
    pos.setXYZ(i * 2 + 1, x, y, length / 2)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.computeBoundingSphere()
}

/** Altura da dobradiça da capa: no alto do miolo com o livro fechado, rente à mesa com ele aberto. */
const HINGE_TOP = BLOCK + BOARD / 2
const HINGE_BOTTOM = -BOARD / 2

/**
 * Como a capa abre: na primeira metade ela gira presa à borda de cima do miolo, como uma capa
 * de verdade; passando de vertical, a dobradiça desce pela lombada até a capa deitar na mesa.
 * Assim a capa nunca se afasta das folhas.
 */
export function coverHinge(cover: number) {
  const e = easeTurn(cover)
  const t = Math.min(1, Math.max(0, (e - 0.5) / 0.5))
  const drop = t * t * (3 - 2 * t)
  return { angle: -(1 - e) * Math.PI, y: HINGE_TOP + (HINGE_BOTTOM - HINGE_TOP) * drop }
}

/**
 * Atualiza a lombada: liga a borda da contracapa (rente à mesa) à dobradiça da capa, à altura
 * `hingeY`, por uma curva que se abaula para fora do livro.
 */
function updateSpine(g: THREE.BufferGeometry, hingeY: number, length: number) {
  const ax = 0
  const ay = HINGE_BOTTOM
  const bx = 0
  const by = hingeY
  const len = Math.hypot(bx - ax, by - ay)
  // para fora do livro: perpendicular à linha entre as duas bordas
  const nx = len > 1e-6 ? -(by - ay) / len : -1
  const ny = len > 1e-6 ? (bx - ax) / len : 0
  const k = len * 0.37 + 0.0015
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i <= SPINE_SEG; i++) {
    const t = i / SPINE_SEG
    const u = 1 - t
    // curva de Bézier cúbica: borda da contracapa → borda da capa
    const x = u * u * u * ax + 3 * u * u * t * (ax + nx * k) + 3 * u * t * t * (bx + nx * k) + t * t * t * bx
    const y = u * u * u * ay + 3 * u * u * t * (ay + ny * k) + 3 * u * t * t * (by + ny * k) + t * t * t * by
    pos.setXYZ(i * 2, x, y, -length / 2)
    pos.setXYZ(i * 2 + 1, x, y, length / 2)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.computeBoundingSphere()
}

type ShadeUniforms = { uEdge: { value: number }; uShade: { value: number }; uSide: { value: number } }

/** Material de página com a sombra suave da folha que passa por cima (acompanha a dobra). */
function pageMaterial(side: 1 | -1 | 0, face: THREE.Side = THREE.FrontSide) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: face })
  const u: ShadeUniforms = { uEdge: { value: 0 }, uShade: { value: 0 }, uSide: { value: side } }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBookX;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBookX = position.x;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBookX;\nuniform float uEdge, uShade, uSide;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // tinta nítida: cada pixel da arte é tinta ou papel, sem cinza intermediário. A letra
        // reduzida pela distância vira um borrão claro; aqui ela volta a ser traço escuro.
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        // tinta nítida: as bordas suavizadas das letras viram tinta cheia ou papel, sem cinza no meio
        diffuseColor.rgb = mix(vec3(0.006, 0.004, 0.002), diffuseColor.rgb, smoothstep(0.16, 0.4, lum));
        // sombra da folha em movimento: escurece o que está debaixo dela, com borda macia
        float under = uSide > 0.0 ? 1.0 - smoothstep(uEdge - 0.03, uEdge + 0.006, vBookX)
                                  : smoothstep(uEdge - 0.006, uEdge + 0.03, vBookX);
        diffuseColor.rgb *= 1.0 - uShade * under;`,
      )
  }
  m.userData.shade = u
  return m
}

const tmpV = new THREE.Vector3()

export function BookModel({ config }: { config: Config }) {
  const snap = useSyncExternalStore(book.subscribe, book.getSnapshot)
  const { pages, last } = snap
  const lt = leafThickness(last)
  const textures = useMemo(() => new PageTextures(config), []) // eslint-disable-line react-hooks/exhaustive-deps
  // redesenha as páginas só quando muda o que aparece nelas (a posição de leitura não conta)
  // tamanho da textura das páginas (1 = 400 × 576), a partir de como a página aparece na tela
  const size = useThree((s) => s.size)
  const texScale = useMemo(() => {
    if (STYLE !== 'pixel') return 1
    const half = snap.single ? READ_HALF_SINGLE : READ_HALF
    // a altura descontada é a das barras de botões
    const pxPerMeter = Math.min(size.width / (2 * half.w), (size.height * 0.86) / (2 * half.h))
    const art = (PAGE_H * pxPerMeter) / pixelSize(size.width, size.height)
    // a letra sai num múltiplo inteiro do pixel da fonte Jersey 10, e pelo menos 3 vezes
    // maior que a tela: reduzida pela placa de vídeo, fica com traço por igual em todas
    // as palavras (testado: 1 ou 2 vezes deixa umas palavras grossas e outras falhadas)
    const font = pageStyle(config).font
    const n = Math.max(3, Math.round(((art / PH) * font) / JERSEY_PX))
    return (n * JERSEY_PX) / font
  }, [size.width, size.height, snap.single, config.fs]) // eslint-disable-line react-hooks/exhaustive-deps
  const artKey = JSON.stringify([config.n, config.p, config.fs, config.bm || [], texScale])
  useEffect(() => textures.set(pages, config, texScale), [textures, pages, artKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const outer = useRef<THREE.Group>(null)
  const rightMesh = useRef<THREE.Mesh>(null)
  const leftPivot = useRef<THREE.Group>(null)
  const leaf = useRef<THREE.Group>(null)
  const spine = useRef<THREE.Mesh>(null)
  const spineGeo = useMemo(() => spineGeometry(), [])
  const joint = useRef<THREE.Mesh>(null)
  const jointGeo = useMemo(() => spineGeometry(), [])
  const hovered = useHovered('book')
  // a área de clique some ao abrir: o contorno e a mãozinha saem junto
  useEffect(() => {
    if (snap.reading) clearHover()
  }, [snap.reading])

  // Qual folha está virando e que alturas/páginas cada parte mostra agora.
  const t = book.turn
  const L = t ? (t.dir === 1 ? t.from : t.from - 1) : 0
  const spread = book.closingFrom || snap.spread
  const view = t
    ? { left: leftHeight(L, lt), right: rightHeight(L + 1, lt), lp: spreadPages(L)[0], rp: spreadPages(L + 1)[1] }
    : { left: leftHeight(spread, lt), right: rightHeight(Math.max(1, spread), lt), lp: spreadPages(spread)[0], rp: spreadPages(Math.max(1, spread))[1] }
  if (spread === 0 && !t) view.right = BLOCK

  const leftMat = useMemo(() => pageMaterial(-1), [])
  const rightMat = useMemo(() => pageMaterial(1), [])
  const frontMat = useMemo(() => pageMaterial(0, THREE.FrontSide), [])
  const backMat = useMemo(() => pageMaterial(0, THREE.BackSide), [])
  const edgeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c2b28c', roughness: 0.95 }), [])
  const coverColor = STYLE === 'pixel' ? '#8a2c3c' : '#6b2430'

  const leftSurface = useMemo(() => restSurface(view.left, -1), [view.left])
  const rightSurface = useMemo(() => restSurface(view.right, 1), [view.right])
  const leftBlock = useMemo(() => blockGeometry(view.left, -1), [view.left])
  const rightBlock = useMemo(() => blockGeometry(view.right, 1), [view.right])

  // texturas das páginas visíveis
  useEffect(() => {
    leftMat.map = view.lp >= 0 ? textures.get(view.lp) : null
    rightMat.map = view.rp >= 0 ? textures.get(view.rp) : null
    leftMat.needsUpdate = rightMat.needsUpdate = true
  }, [view.lp, view.rp, textures, pages, artKey, leftMat, rightMat])

  // folha que vira: duas malhas (frente e verso) com as mesmas posições
  const leafGeo = useMemo(() => {
    const front = surfaceGeometry(COLS, ROWS, false)
    const back = surfaceGeometry(COLS, ROWS, true)
    back.setIndex(front.getIndex())
    back.setAttribute('position', front.attributes.position)
    front.computeVertexNormals()
    back.setAttribute('normal', front.attributes.normal)
    ;(front.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage)
    return { front, back }
  }, [])
  useEffect(() => {
    if (!t) return
    frontMat.map = textures.get(2 * L - 1)
    backMat.map = textures.get(2 * L)
    frontMat.needsUpdate = backMat.needsUpdate = true
  }, [t, L, textures, pages, artKey, frontMat, backMat])

  const prm = useMemo<CurlParams>(
    () => ({ width: PAGE_W, height: PAGE_H, cols: COLS, rows: ROWS, rightHeight: rightHeight(L, lt), leftHeight: leftHeight(L + 1, lt), gutter: GUTTER }),
    [L, lt],
  )

  // capa: gravação dourada com o nome do acervo
  const goldAlpha = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 360
    c.height = 520
    const g = c.getContext('2d')!
    g.fillStyle = '#000'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = g.fillStyle = '#fff'
    g.lineWidth = 6
    g.strokeRect(22, 22, 316, 476)
    g.lineWidth = 2
    g.strokeRect(34, 34, 292, 452)
    g.textAlign = 'center'
    const name = config.n || 'Arquivo das Sombras'
    // em maiúsculas a letra gótica fica ilegível: usa a letra pixel comum
    g.font = name === name.toLocaleUpperCase('pt-BR') ? `600 26px "Pixelify Sans", sans-serif` : `36px "Jacquarda Bastarda 9", serif`
    const words = name.split(/\s+/)
    words.slice(0, 4).forEach((w, i) => g.fillText(w, 180, 230 + i * 40 - (words.length - 1) * 20))
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.NoColorSpace
    return tex
  }, [config.n])
  useEffect(() => () => goldAlpha.dispose(), [goldAlpha])

  // abrir pelo atalho de teclado e pelo teste visual (?debug)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __book: typeof book }).__book = book
  }, [])

  // eventos: clique abre ou vira; arrastar segura a folha
  const { camera, gl } = useThree()
  const drag = useRef<{ x: number; y: number; dir: 1 | -1; started: boolean; f0: number; p0: number; lastP: number; lastT: number; vel: number; toc?: number } | null>(null)
  const plane = useMemo(() => new THREE.Plane(), [])
  const ray = useMemo(() => new THREE.Raycaster(), [])

  const localX = (clientX: number, clientY: number) => {
    const g = outer.current
    if (!g) return 0
    const r = gl.domElement.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera)
    plane.setFromNormalAndCoplanarPoint(tmpV.set(0, 1, 0), g.localToWorld(new THREE.Vector3(0, BLOCK * 0.6, 0)))
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3())
    return hit ? g.worldToLocal(hit).x : 0
  }
  const f = (x: number) => Math.acos(Math.min(1, Math.max(-1, x / PAGE_W))) / Math.PI

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return
        if (!book.beginDrag(d.dir)) {
          drag.current = null
          return
        }
        d.started = true
        d.p0 = d.dir === 1 ? 0 : 1
      }
      const p = Math.min(1, Math.max(0, d.p0 + f(localX(e.clientX, e.clientY)) - d.f0))
      const now = performance.now()
      const dt = Math.max(1, now - d.lastT) / 1000
      d.vel = d.vel * 0.6 + ((p - d.lastP) / dt) * 0.4
      d.lastP = p
      d.lastT = now
      book.dragTo(p)
    }
    const up = () => {
      const d = drag.current
      drag.current = null
      if (!d) return
      if (d.started) book.endDrag(d.vel)
      else if (d.toc !== undefined) book.goToPage(d.toc)
      else book.step(d.dir)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
    return () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
    }
  })

  /** Entrada do índice sob o ponteiro, na página da esquerda ou da direita. */
  const tocUnder = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv || book.turn) return undefined
    const index = e.object === rightMesh.current ? view.rp : view.lp
    if (index < 0 || pages[index]?.k !== 'toc') return undefined
    return textures.tocAt(index, (1 - e.uv.y) * PH)
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (book.coverTarget === 0) return
    const toc = tocUnder(e)
    if (book.single) {
      // uma página por vez (celular): toque na metade direita avança, na esquerda volta;
      // deslizar o dedo para a esquerda avança, como no original
      const x0 = e.clientX
      const up = (u: PointerEvent) => {
        removeEventListener('pointerup', up)
        const dx = u.clientX - x0
        if (Math.abs(dx) > 50) book.step(dx < 0 ? 1 : -1)
        else if (toc !== undefined) book.goToPage(toc)
        else book.step(u.clientX > innerWidth / 2 ? 1 : -1)
      }
      addEventListener('pointerup', up)
      return
    }
    const x = localX(e.clientX, e.clientY)
    drag.current = { x: e.clientX, y: e.clientY, dir: x >= 0 ? 1 : -1, started: false, f0: f(x), p0: 0, lastP: x >= 0 ? 0 : 1, lastT: performance.now(), vel: 0, toc }
  }

  // mãozinha sobre as entradas do índice
  const hover = (e: ThreeEvent<PointerEvent>) => {
    document.body.style.cursor = tocUnder(e) !== undefined ? 'pointer' : ''
  }
  const unhover = () => (document.body.style.cursor = '')

  useFrame((_, dt) => {
    book.update(dt)
    const open = easeTurn(Math.min(1, book.cover * 1.15))
    const pose = bookPose(open)
    const g = outer.current!
    g.position.set(pose.x, DESK.height + BOARD, pose.z)
    g.rotation.y = pose.r
    // capa (com as folhas já lidas, ao fechar do meio do livro) gira em torno da lombada
    const hinge = coverHinge(book.cover)
    leftPivot.current!.rotation.z = hinge.angle
    leftPivot.current!.position.y = hinge.y
    // a lombada acompanha a capa em todo o movimento; aberta, fica escondida sob as folhas
    spine.current!.visible = book.cover < 0.999
    if (spine.current!.visible) updateSpine(spineGeo, hinge.y, PAGE_H + OVER * 2)
    joint.current!.visible = book.cover > 0 && book.cover < 0.999
    if (joint.current!.visible) updateJoint(jointGeo, hinge.angle, hinge.y, view.left, view.right, PAGE_H)

    const tt = book.turn
    leaf.current!.visible = !!tt
    let shadeR = 0
    let shadeL = 0
    if (tt) {
      const pos = leafGeo.front.attributes.position as THREE.BufferAttribute
      curlLeaf(pos.array as Float32Array, tt.p, prm, LIFT)
      pos.needsUpdate = true
      leafGeo.front.computeVertexNormals()
      leafGeo.front.computeBoundingSphere()
      // extremos da folha na fileira do meio: até onde ela cobre cada página
      const row = (ROWS / 2) * (COLS + 1) * 3
      let maxX = 0
      let minX = 0
      for (let i = 0; i <= COLS; i++) {
        const x = pos.array[row + i * 3]
        maxX = Math.max(maxX, x)
        minX = Math.min(minX, x)
      }
      const s = Math.sin(Math.PI * tt.p)
      ;(rightMat.userData.shade as ShadeUniforms).uEdge.value = maxX
      ;(leftMat.userData.shade as ShadeUniforms).uEdge.value = minX
      shadeR = 0.5 * s * (1 - tt.p)
      shadeL = 0.5 * s * tt.p
    }
    ;(rightMat.userData.shade as ShadeUniforms).uShade.value = shadeR
    ;(leftMat.userData.shade as ShadeUniforms).uShade.value = shadeL
  })

  const coverW = PAGE_W + OVER
  const coverH = PAGE_H + OVER * 2
  return (
    <group ref={outer}>
      {/* metade direita: contracapa, folhas e página da direita */}
      <RoundedBox args={[coverW, BOARD, coverH]} radius={0.0012} smoothness={2} position={[coverW / 2, -BOARD / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={coverColor} roughness={0.6} />
      </RoundedBox>
      {rightBlock && <mesh geometry={rightBlock} material={edgeMat} castShadow receiveShadow />}
      <mesh ref={rightMesh} geometry={rightSurface} material={rightMat} receiveShadow onPointerDown={onDown} onPointerMove={hover} onPointerOut={unhover} />

      {/* metade esquerda: capa, folhas lidas e página da esquerda; gira para fechar */}
      <group ref={leftPivot}>
        {/* a dobradiça é a borda da capa junto à lombada, no meio da espessura da capa */}
        <group position={[0, BOARD / 2, 0]}>
          <RoundedBox args={[coverW, BOARD, coverH]} radius={0.0012} smoothness={2} position={[-coverW / 2, -BOARD / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={coverColor} roughness={0.6} />
          </RoundedBox>
          {leftBlock && <mesh geometry={leftBlock} material={edgeMat} castShadow receiveShadow />}
          <mesh geometry={leftSurface} material={leftMat} receiveShadow onPointerDown={onDown} onPointerMove={hover} onPointerOut={unhover} />
          {/* gravação dourada na face de fora da capa */}
          <mesh position={[-coverW / 2, -BOARD - 0.0003, 0]} rotation={[Math.PI / 2, 0, Math.PI]}>
            <planeGeometry args={[coverW * 0.92, coverH * 0.94]} />
            <meshStandardMaterial color="#c9a25a" metalness={1} roughness={0.4} envMapIntensity={4} emissive="#c5a059" emissiveIntensity={STYLE === 'pixel' ? 0.45 : 0} alphaMap={goldAlpha} transparent depthWrite={false} />
          </mesh>
        </group>
      </group>

      {/* lombada: liga capa e contracapa enquanto o livro abre ou fecha */}
      <mesh ref={spine} geometry={spineGeo} castShadow receiveShadow>
        <meshStandardMaterial color={coverColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* folha de guarda junto à lombada: fecha o vão entre a capa e o miolo enquanto a capa abre */}
      <mesh ref={joint} geometry={jointGeo} receiveShadow>
        <meshStandardMaterial color="#cfc29f" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {/* folha virando */}
      <group ref={leaf} visible={false}>
        <mesh geometry={leafGeo.front} material={frontMat} castShadow receiveShadow />
        <mesh geometry={leafGeo.back} material={backMat} castShadow receiveShadow />
      </group>

      {/* livro fechado: área de clique para abrir */}
      {snap.reading ? null : (
        <mesh position={[coverW / 2, BLOCK / 2, 0]} {...clickable('book', () => book.open())}>
          <boxGeometry args={[coverW + 0.02, BLOCK + BOARD * 2 + 0.02, coverH + 0.02]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      )}

      {/* filete dourado em volta do livro fechado, só com o mouse em cima; afastado 2 mm da mesa para não piscar */}
      {hovered && !snap.reading && (
        <mesh position={[coverW / 2 - 0.004, -BOARD + 0.002 + (BLOCK + BOARD * 2 + 0.004) / 2, 0]} material={outlineMaterial}>
          <boxGeometry args={[coverW + 0.028, BLOCK + BOARD * 2 + 0.004, coverH + 0.02]} />
        </mesh>
      )}
    </group>
  )
}
