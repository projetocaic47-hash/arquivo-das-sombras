import { useEffect, useRef, useState } from 'react'
import { useModal } from '../ui/focus'
import { candleLit, opened, press, START, type PuzzleState, type Spot } from './puzzle'
import { play, stopAll, unlockSound } from './sound'

// Tela de entrada: a porta da casa abandonada (imagem do diretor, public/entrada/porta.jpg).
// Bater três vezes no meio da porta, acender a vela do castiçal, examinar o cartaz: a porta
// range, abre devagar sobre as dobradiças e deixa ver o app atrás dela, e a câmera entra.
// Tudo é desenhado num canvas do tamanho da imagem, em blocos de 4 pixels como a arte.

/** Tamanho da imagem original; todas as posições abaixo são pixels dela. */
const IW = 1052
const IH = 1024
const PX = 4
/** folha da porta (sem o batente) e a dobradiça à esquerda */
const DOOR = { x0: 312, x1: 742, y0: 96, y1: 862 }
/** áreas de clique, folgadas para não exigir precisão */
const HOT: Record<Spot, { x: number; y: number; w: number; h: number; label: string }> = {
  door: { x: 372, y: 210, w: 316, h: 500, label: 'Porta' },
  candle: { x: 878, y: 205, w: 128, h: 165, label: 'Castiçal' },
  poster: { x: 14, y: 132, w: 132, h: 280, label: 'Cartaz' },
}
const POSTER = { x: 24, y: 144, w: 112, h: 250 }
/** ponta do pavio */
const WICK = { x: 922, y: 244 }
/** altura dos olhos de quem olha a porta (ponto de fuga) */
const EYE_Y = 470
const FOCAL = 1500
const OPEN_SECONDS = 5.2
const MAX_ANGLE = (84 * Math.PI) / 180

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const snap = (v: number) => Math.round(v / PX) * PX

/** Abertura da porta pesada e enferrujada: solta um pouco, emperra, e então cede devagar. */
export function doorAngle(t: number) {
  if (t <= 0) return 0
  if (t >= 1) return MAX_ANGLE
  const crack = 0.07 * MAX_ANGLE
  if (t < 0.14) return crack * Math.sin((t / 0.14) * (Math.PI / 2))
  if (t < 0.24) return crack + Math.sin(((t - 0.14) / 0.1) * Math.PI * 3) * 0.004
  const u = (t - 0.24) / 0.76
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
  return crack + (MAX_ANGLE - crack) * e
}

/** Brilho da vela: Bayer 4×4 em blocos, três raios para o tremor. */
function glowSprites() {
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  return [190, 200, 212].map((r) => {
    const n = Math.ceil((r * 2) / PX)
    const c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d')!
    const img = g.createImageData(n, n)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2)
        const v = Math.max(0, 1 - d) ** 1.7
        // poucos níveis, com pontilhado: luz em pixel art
        const lv = Math.floor(v * 5 + B[(y % 4) * 4 + (x % 4)] / 16) / 5
        const i = (y * n + x) * 4
        img.data[i] = 255
        img.data[i + 1] = 158
        img.data[i + 2] = 70
        img.data[i + 3] = Math.round(lv * 255)
      }
    g.putImageData(img, 0, 0)
    return { c, r }
  })
}

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
}

export function Entrance({ onEnter }: { onEnter: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PuzzleState>(START)
  const stateRef = useRef(state)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const [leaving, setLeaving] = useState(false)
  const [said, setSaid] = useState('')
  // tempos dos efeitos, lidos pelo desenho a cada quadro
  const root = useRef<HTMLDivElement>(null)
  // o teclado fica na porta enquanto ela está fechada (sem destacar nada ao abrir)
  useModal(root, undefined, () => root.current)
  const fx = useRef({ knockAt: -1, igniteAt: -1, posterAt: -1, openAt: -1, motes: [] as Mote[] })

  // tamanho: a imagem cobre a tela, mas porta, vela e cartaz sempre ficam à vista
  useEffect(() => {
    const fit = () => {
      const w = innerWidth
      const h = innerHeight
      setScale(Math.min(Math.max(w / IW, h / IH), w / 1000, h / 880))
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])

  const dust = (x0: number, x1: number, y: number, n: number, fall = 1) => {
    for (let i = 0; i < n; i++)
      fx.current.motes.push({
        x: x0 + Math.random() * (x1 - x0),
        y: y + Math.random() * 12,
        vx: (Math.random() - 0.5) * 10,
        vy: (12 + Math.random() * 28) * fall,
        life: 0,
        max: 1.2 + Math.random() * 1.6,
      })
  }

  // ?debug: os testes visuais congelam a abertura num instante (0 a 1) para fotografar
  const frozen = useRef<number | null>(null)
  useEffect(() => {
    if (!location.search.includes('debug')) return
    ;(window as unknown as { __doorAt: (t: number | null) => void }).__doorAt = (t) => (frozen.current = t)
  }, [])
  const finish = useRef(false)
  const startOpening = (now: number) => {
    fx.current.openAt = now
    play('hinges')
    // a câmera atravessa a porta perto do fim da abertura
    const total = reduced() ? 1.2 : OPEN_SECONDS
    const later = (fn: () => void, ms: number) => {
      const go = () => (frozen.current === null ? fn() : setTimeout(go, 200))
      setTimeout(go, ms)
    }
    later(() => setLeaving(true), total * 0.78 * 1000)
    later(() => {
      if (finish.current) return
      finish.current = true
      stateRef.current = opened(stateRef.current)
      setState(stateRef.current)
      stopAll()
      onEnter()
    }, (total * 0.78 + 1.3) * 1000)
  }

  const onSpot = (spot: Spot) => {
    unlockSound()
    const r = press(stateRef.current, spot)
    if (!r.effect) return
    stateRef.current = r.state
    setState(r.state)
    const now = performance.now() / 1000
    if (r.effect === 'knock') {
      fx.current.knockAt = now
      play('knock')
      dust(DOOR.x0 + 20, DOOR.x1 - 20, DOOR.y0, 6)
      setSaid(r.state.k === 'knock' ? `Batida ${r.state.n}.` : 'Terceira batida.')
    } else if (r.effect === 'ignite') {
      fx.current.igniteAt = now
      play('ignite')
      setSaid('A vela acendeu.')
    } else if (r.effect === 'poster') {
      fx.current.posterAt = now
      play('creak')
      setSaid('O cartaz se mexeu. A porta range e começa a abrir.')
      // o rangido da madeira vem antes; logo depois a porta cede
      setTimeout(() => startOpening(performance.now() / 1000), reduced() ? 200 : 900)
    }
  }

  // desenho
  useEffect(() => {
    const c = canvas.current!
    const g = c.getContext('2d')!
    const img = new Image()
    img.src = `${import.meta.env.BASE_URL}entrada/porta.jpg`
    const glows = glowSprites()
    let raf = 0
    let last = performance.now() / 1000
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = performance.now() / 1000
      const dt = Math.min(0.05, now - last)
      last = now
      if (!img.complete || !img.naturalWidth) return
      const f = fx.current
      const s = stateRef.current
      const rm = reduced()
      // a tela é desenhada na resolução real do aparelho (telas de alta densidade incluídas),
      // e não na da imagem esticada; as medidas continuam em pixels da imagem
      const W = Math.min(4096, Math.round(IW * scaleRef.current * (devicePixelRatio || 1)))
      if (c.width !== W) {
        c.width = W
        c.height = Math.round((W * IH) / IW)
      }
      g.setTransform(c.width / IW, 0, 0, c.height / IH, 0, 0)
      // a imagem ampliada com suavização de qualidade; os efeitos em blocos (chama, brilho,
      // poeira) são retângulos e continuam nítidos
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.clearRect(0, 0, IW, IH)
      g.drawImage(img, 0, 0, IW, IH)
      // recorte da imagem em medidas da imagem original (o arquivo pode ser maior: ampliado)
      const k = img.naturalWidth / IW
      const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) =>
        g.drawImage(img, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh)

      // ---- porta: tremor das batidas ou abertura ----
      const opening = f.openAt >= 0
      const t = opening ? (frozen.current ?? (now - f.openAt) / (rm ? 1.2 : OPEN_SECONDS)) : 0
      const kt = now - f.knockAt
      const shake = !opening && f.knockAt >= 0 && kt < 0.16 && !rm ? (kt < 0.05 ? PX : kt < 0.1 ? -PX / 2 : PX / 2) : 0
      const dw = DOOR.x1 - DOOR.x0
      const dh = DOOR.y1 - DOOR.y0
      if (shake) {
        g.fillStyle = '#050403'
        g.fillRect(DOOR.x0, DOOR.y0, dw, dh)
        part(DOOR.x0, DOOR.y0, dw, dh, DOOR.x0 + shake, DOOR.y0, dw, dh)
      }
      if (opening) {
        // o vão da porta: escuro no começo, e aos poucos o app aparece por ele
        const reveal = rm ? Math.min(1, t) : Math.min(1, Math.max(0, (t - 0.22) / 0.5))
        g.clearRect(DOOR.x0, DOOR.y0, dw, dh)
        g.fillStyle = `rgba(5,4,3,${1 - reveal * 0.92})`
        g.fillRect(DOOR.x0, DOOR.y0, dw, dh)
        if (rm) {
          g.globalAlpha = Math.max(0, 1 - t)
          part(DOOR.x0, DOOR.y0, dw, dh, DOOR.x0, DOOR.y0, dw, dh)
          g.globalAlpha = 1
        } else {
          // folha girando na dobradiça da esquerda, para dentro: cada coluna de 4 px da
          // imagem vai para a sua posição em perspectiva, encolhendo com a distância
          const a = doorAngle(t)
          const cos = Math.cos(a)
          const sin = Math.sin(a)
          for (let sx = 0; sx < dw; sx += PX) {
            const u0 = sx
            const u1 = Math.min(dw, sx + PX)
            const p0 = FOCAL / (FOCAL + u0 * sin)
            const p1 = FOCAL / (FOCAL + u1 * sin)
            const x0 = DOOR.x0 + u0 * cos * p0
            const x1 = DOOR.x0 + u1 * cos * p1
            const top = EYE_Y - (EYE_Y - DOOR.y0) * p0
            const h = dh * p0
            const w = Math.max(1, x1 - x0)
            const X = snap(x0)
            const Y = snap(top)
            const Wd = Math.max(PX, snap(x0 + w) - X)
            part(DOOR.x0 + sx, DOOR.y0, u1 - u0, dh, X, Y, Wd, snap(top + h) - Y)
            // quanto mais virada, menos luz recebe a madeira
            g.fillStyle = `rgba(0,0,0,${Math.min(0.75, sin * 0.55 + (u0 / dw) * sin * 0.2)})`
            g.fillRect(X, Y, Wd, snap(top + h) - Y)
          }
          // a poeira desprende do alto da porta enquanto ela se move
          if (t < 0.9 && Math.random() < dt * 14) dust(DOOR.x0 + 10, DOOR.x0 + dw * cos, DOOR.y0, 2, 0.8)
        }
      }

      // ---- cartaz: balança preso pelo alto e clareia um instante ----
      const pt = now - f.posterAt
      if (f.posterAt >= 0 && pt < 1.4) {
        const k = rm ? 0 : Math.exp(-pt * 3) * Math.sin(pt * 14)
        g.save()
        g.fillStyle = 'rgba(6,8,9,0.9)'
        g.fillRect(POSTER.x - 2, POSTER.y - 2, POSTER.w + 4, POSTER.h + 4)
        g.translate(POSTER.x + POSTER.w / 2, POSTER.y)
        g.rotate(k * 0.035)
        g.filter = `brightness(${1 + 0.35 * Math.max(0, 1 - pt / 1.2)})`
        part(POSTER.x, POSTER.y, POSTER.w, POSTER.h, -POSTER.w / 2, 0, POSTER.w, POSTER.h)
        g.restore()
        g.filter = 'none'
      }

      // ---- vela ----
      if (candleLit(s) && f.igniteAt >= 0) {
        const it = now - f.igniteAt
        const grow = Math.min(1, it / 0.6)
        const flick = rm ? 1 : 0.9 + 0.06 * Math.sin(now * 9.1) + 0.04 * Math.sin(now * 23.7 + 1.3) + (Math.random() - 0.5) * 0.04
        const light = Math.min(1, it / 1.4) * flick
        const glow = glows[rm ? 1 : Math.min(2, Math.max(0, Math.round((flick - 0.9) * 25 + 1)))]
        g.globalCompositeOperation = 'lighter'
        g.globalAlpha = 0.42 * light
        g.imageSmoothingEnabled = false
        g.drawImage(glow.c, snap(WICK.x - glow.r), snap(WICK.y - 12 - glow.r), glow.r * 2, glow.r * 2)
        g.globalAlpha = 1
        g.imageSmoothingEnabled = true
        g.globalCompositeOperation = 'source-over'
        // chama em blocos: núcleo claro, corpo laranja, ponta avermelhada
        const hgt = Math.round((5 + (rm ? 0 : Math.round(Math.sin(now * 11) + Math.random() * 0.6))) * grow)
        const sway = rm ? 0 : Math.round(Math.sin(now * 5.3) * 0.6)
        for (let i = 0; i < hgt; i++) {
          const y = WICK.y - PX * (i + 1)
          const wide = i === 0 || i >= hgt - 1 ? 1 : i < hgt - 2 ? 2 : 1
          const col = i < 2 ? '#fff4c8' : i < hgt - 1 ? '#ffb347' : '#e8622c'
          const x = WICK.x - (wide === 2 ? PX : PX / 2) + (i > 1 ? sway * PX : 0)
          g.fillStyle = col
          g.fillRect(snap(x), y, wide * PX, PX)
        }
        if (it < 0.25 && !rm) {
          // faísca do acendimento
          g.fillStyle = `rgba(255,240,200,${1 - it / 0.25})`
          g.fillRect(snap(WICK.x - 8), WICK.y - 24, PX * 4, PX * 4)
        }
      }

      // ---- poeira ----
      const motes = f.motes
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]
        m.life += dt
        if (m.life > m.max) {
          motes.splice(i, 1)
          continue
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        m.vy *= 0.985
        const a = Math.sin((m.life / m.max) * Math.PI) * 0.55
        const warm = candleLit(s) ? Math.max(0, 1 - Math.hypot(m.x - WICK.x, m.y - WICK.y) / 400) : 0
        g.fillStyle = `rgba(${200 + warm * 55},${190 + warm * 20},${170 - warm * 50},${a})`
        g.fillRect(snap(m.x), snap(m.y), PX, PX)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ao sair, o som para
  useEffect(() => () => stopAll(), [])

  // centro do vão da porta, para a câmera atravessar
  const ox = ((DOOR.x0 + DOOR.x1) / 2 / IW) * 100
  const oy = ((DOOR.y0 + DOOR.y1) / 2 / IH) * 100
  const zoom = Math.max(innerWidth / ((DOOR.x1 - DOOR.x0) * scale), innerHeight / ((DOOR.y1 - DOOR.y0) * scale)) * 1.15
  return (
    <div ref={root} tabIndex={-1} className={'entrance' + (leaving ? ' leaving' : '')} data-state={state.k} data-knocks={state.k === 'knock' ? state.n : 3}>
      <div
        ref={box}
        className="entrance-art"
        style={{ width: IW * scale, height: IH * scale, transformOrigin: `${ox}% ${oy}%`, transform: leaving && !reduced() ? `scale(${zoom})` : undefined }}
      >
        <canvas ref={canvas} width={IW} height={IH} aria-hidden="true" />
        {(Object.keys(HOT) as Spot[]).map((k) => {
          const h = HOT[k]
          return (
            <button
              key={k}
              type="button"
              className="hot"
              aria-label={h.label}
              data-spot={k}
              disabled={state.k === 'opening' || state.k === 'done'}
              style={{ left: `${(h.x / IW) * 100}%`, top: `${(h.y / IH) * 100}%`, width: `${(h.w / IW) * 100}%`, height: `${(h.h / IH) * 100}%` }}
              onClick={() => onSpot(k)}
            />
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  )
}
