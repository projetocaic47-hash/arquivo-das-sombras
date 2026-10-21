// Porta de entrada em celulares e tablets emulados (Chromium com toque): só toques, sem
// mouse nem hover; áreas de toque alinhadas e não cobertas; um toque = uma batida e um som;
// girar a tela no meio do puzzle; sons da porta destravados pelo toque.
// Não substitui um teste em aparelho físico (e não há WebKit/Safari neste ambiente).
// Uso: node e2e/porta-celular.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/porta-celular'
await mkdir(out, { recursive: true })
// sem a flag de autoplay: o áudio só pode começar com o toque
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let fails = 0
const check = (ok, what) => {
  console.log((ok ? 'OK    ' : 'FALHA ') + what)
  if (!ok) fails++
}
const flip = (v) => ({ width: v.height, height: v.width })

async function run(name, device, { landscape = false, rotateAt = -1 } = {}) {
  const d = devices[device]
  const vp = landscape ? flip(d.viewport) : d.viewport
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: d.userAgent })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto(`http://localhost:${port}/?debug&porta`)
  const ent = p.locator('.entrance')
  await ent.waitFor()
  await p.waitForTimeout(1200)
  const label = `${name} (${device}, ${vp.width}×${vp.height})`
  const state = () => ent.getAttribute('data-state', { timeout: 2000 }).catch(() => 'done')
  const knocks = async () => +(await ent.getAttribute('data-knocks', { timeout: 2000 }).catch(() => '3'))
  const sounds = () => p.evaluate(() => window.__sfx.log.map((e) => e.name))

  /** Confere cada área: dentro da tela e da imagem, grande o bastante, e é ela que recebe o toque. */
  const layout = async (when) => {
    const r = await p.evaluate(() => {
      const c = document.querySelector('.entrance canvas').getBoundingClientRect()
      return [...document.querySelectorAll('.entrance [data-spot]')].map((h) => {
        const b = h.getBoundingClientRect()
        const cx = b.left + b.width / 2
        const cy = b.top + b.height / 2
        const top = document.elementFromPoint(cx, cy)
        return {
          spot: h.dataset.spot,
          w: Math.round(b.width),
          h: Math.round(b.height),
          inside: cx > Math.max(0, c.left) && cx < Math.min(innerWidth, c.right) && cy > Math.max(0, c.top) && cy < Math.min(innerHeight, c.bottom),
          free: !!top && (top === h || h.contains(top)),
        }
      })
    })
    check(r.length === 3 && r.every((x) => x.inside), `${label} ${when}: porta, castiçal e cartaz dentro da tela e da imagem`)
    check(r.every((x) => x.free), `${label} ${when}: nenhuma área de toque coberta por outro elemento`)
    check(r.every((x) => Math.min(x.w, x.h) >= 32), `${label} ${when}: áreas de toque grandes o bastante (${r.map((x) => `${x.spot} ${x.w}×${x.h}`).join(', ')})`)
  }
  /** Toque de verdade no centro da área (touchstart/touchend, sem mouse). */
  const tap = async (spot) => {
    const box = await p.locator(`[data-spot=${spot}]`).boundingBox()
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  }

  await layout('ao abrir')
  check((await p.evaluate(() => window.__sfx.state())) === 'none', `${label}: sem áudio antes do primeiro toque`)
  for (let i = 1; i <= 3; i++) {
    const s0 = (await sounds()).length
    await tap('door')
    await p.waitForTimeout(300)
    const got = (await sounds()).slice(s0)
    check((await knocks()) === i || (i === 3 && (await state()) === 'candle'), `${label}: toque ${i} = batida ${i}`)
    check(got.join() === 'door.knock', `${label}: toque ${i} tocou um som só (${got.join(', ') || 'nenhum'})`)
    if (i === 1) check((await p.evaluate(() => window.__sfx.state())) === 'running', `${label}: o primeiro toque destravou o áudio`)
    if (i === rotateAt) {
      await p.setViewportSize(flip(p.viewportSize()))
      await p.waitForTimeout(800)
      await layout('depois de girar a tela')
      await p.screenshot({ path: `${out}/${name}-girado.png` })
    }
  }
  check((await state()) === 'candle', `${label}: três batidas liberam a vela`)
  await tap('candle')
  check((await state()) === 'poster', `${label}: a vela acende com um toque`)
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `${out}/${name}-vela.png` })
  await tap('poster')
  check((await state()) === 'opening', `${label}: o cartaz começa a abertura`)
  // toques repetidos durante a abertura: ignorados, sem sons extras
  const s0 = (await sounds()).length
  for (let i = 0; i < 4; i++) await p.touchscreen.tap(vp.width / 2, vp.height / 2)
  await p.waitForTimeout(1600)
  await p.screenshot({ path: `${out}/${name}-abrindo.png` })
  const extra = (await sounds()).slice(s0).filter((n) => n !== 'door.hinges')
  check(!extra.length, `${label}: toques durante a abertura não tocam nada a mais (${extra.join(', ') || 'nenhum'})`)
  await p.waitForSelector('.entrance', { state: 'detached', timeout: 20000 }).catch(() => {})
  check(!(await ent.count()), `${label}: a porta abriu e saiu da frente`)
  check(await p.locator('.topbar').isVisible(), `${label}: o app aparece em seguida`)
  const all = await sounds()
  const want = ['door.knock', 'door.knock', 'door.knock', 'door.ignite', 'door.poster', 'door.hinges']
  check(all.slice(0, 6).join() === want.join(), `${label}: sons da porta na ordem (${all.slice(0, 6).join(', ')})`)
  await p.waitForTimeout(900)
  check((await p.evaluate(() => window.__sfx.live())) <= 1, `${label}: sons da porta encerrados com fade ao entrar`)
  await p.screenshot({ path: `${out}/${name}-dentro.png` })
  check(!errors.length, errors.length ? `${label}: erros no console: ${errors.join(' | ')}` : `${label}: nenhum erro no console`)
  await ctx.close()
}

await run('celular-pe', 'Pixel 7')
await run('celular-deitado', 'Pixel 7', { landscape: true })
await run('iphone-pe-gira', 'iPhone 13', { rotateAt: 2 })
await run('iphone-se', 'iPhone SE')
await run('tablet-pe', 'iPad (gen 7)')
await run('tablet-deitado-gira', 'iPad (gen 7)', { landscape: true, rotateAt: 1 })
await run('galaxy-tab', 'Galaxy Tab S4', { landscape: true })
await b.close()
process.exit(fails ? 1 : 0)
