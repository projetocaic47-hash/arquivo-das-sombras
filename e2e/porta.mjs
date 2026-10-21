// Porta de entrada: sequência completa (3 batidas, vela, cartaz, abertura), cliques fora
// de ordem, alinhamento das áreas em vários tamanhos de tela, som com e sem arquivos.
// Uso: node e2e/porta.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/porta'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
let fails = 0
const check = (ok, what) => {
  console.log((ok ? 'OK    ' : 'FALHA ') + what)
  if (!ok) fails++
}

/** WAV curto de teste (ruído com decaimento), só para conferir que o som carrega e toca. */
function wav() {
  const n = 4410
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(44100, 24)
  buf.writeUInt32LE(88200, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((Math.random() - 0.5) * 8000 * Math.exp(-i / 800)), 44 + i * 2)
  return buf
}

async function run(name, vp, opts = {}) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: !!opts.touch, isMobile: !!opts.touch, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  if (opts.sound) {
    await p.route('**/sons/lista.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(['porta-batida-1.wav', 'porta-batida-2.wav', 'porta-batida-3.wav', 'vela-acender.wav', 'madeira-rangendo.wav', 'porta-abrindo.wav']) }))
    await p.route('**/sons/*.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }))
    // conta quantos sons começam a tocar
    await p.addInitScript(() => {
      window.__sounds = 0
      const start = AudioBufferSourceNode.prototype.start
      // só os arquivos de teste (0,1 s); o motor também toca buffers sintetizados e um silêncio de destrava
      AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && Math.abs(this.buffer.duration - 0.1) < 0.002) window.__sounds++; return start.apply(this, a) }
    })
  }
  await p.goto(`http://localhost:${port}/?debug&porta`)
  const ent = p.locator('.entrance')
  await ent.waitFor()
  await p.waitForTimeout(1500)
  const state = async () => ((await ent.count()) ? ent.getAttribute('data-state', { timeout: 2000 }).catch(() => 'done') : 'done')
  const knocks = () => ent.getAttribute('data-knocks')
  const tap = (spot) => (opts.touch ? p.locator(`[data-spot=${spot}]`).tap() : p.locator(`[data-spot=${spot}]`).click())

  // alinhamento: as áreas de clique desenhadas por cima da imagem, só nesta captura
  await p.addStyleTag({ content: '.entrance .hot{outline:2px solid #f0f !important}' })
  await p.screenshot({ path: `${out}/${name}-0-areas.png` })
  await p.addStyleTag({ content: '.entrance .hot{outline:none !important}' })
  const inside = await p.evaluate(() => {
    const c = document.querySelector('.entrance canvas').getBoundingClientRect()
    return [...document.querySelectorAll('.entrance .hot')].every((h) => {
      const r = h.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      return cx > Math.max(0, c.left) && cx < Math.min(innerWidth, c.right) && cy > Math.max(0, c.top) && cy < Math.min(innerHeight, c.bottom)
    })
  })
  check(inside, `${name}: porta, castiçal e cartaz à vista e dentro da imagem`)

  // fora de ordem não avança
  await tap('candle')
  await tap('poster')
  check((await state()) === 'knock' && (await knocks()) === '0', `${name}: vela e cartaz antes das batidas não fazem nada`)
  for (let i = 1; i <= 3; i++) {
    await tap('door')
    await p.waitForTimeout(250)
    if (i === 1) await p.screenshot({ path: `${out}/${name}-1-batida.png` })
  }
  check((await state()) === 'candle', `${name}: três batidas liberam a vela`)
  await tap('door')
  await tap('poster')
  check((await state()) === 'candle', `${name}: bater de novo ou clicar no cartaz não muda nada`)
  await tap('candle')
  check((await state()) === 'poster', `${name}: a vela acende depois das batidas`)
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `${out}/${name}-2-vela.png` })
  await tap('candle')
  await tap('door')
  check((await state()) === 'poster', `${name}: castiçal e porta depois da vela não mudam nada`)
  if (opts.frames) await p.evaluate(() => window.__doorAt(0.03))
  await tap('poster')
  check((await state()) === 'opening', `${name}: o cartaz começa a abertura`)
  if (opts.frames) {
    // quadros da abertura, congelados para a foto (o navegador de teste desenha devagar)
    for (const t of [0.03, 0.2, 0.45, 0.7, 0.9]) {
      await p.evaluate((t) => window.__doorAt(t), t)
      await p.waitForTimeout(2500)
      await p.screenshot({ path: `${out}/${name}-quadro-${String(t).replace('.', '')}.png` })
    }
    await p.evaluate(() => window.__doorAt(null))
  }
  // cliques repetidos durante a abertura são ignorados
  await p.locator('[data-spot=poster]').click({ force: true }).catch(() => {})
  check(['opening', 'done'].includes(await state()), `${name}: cliques durante a abertura são ignorados`)
  for (const [k, ms] of [['3-abrindo', 1700], ['4-abrindo', 1600], ['5-abrindo', 1200]]) {
    await p.waitForTimeout(ms)
    await p.screenshot({ path: `${out}/${name}-${k}.png` })
  }
  await p.waitForSelector('.entrance', { state: 'detached', timeout: 15000 }).catch(() => {})
  check(!(await ent.count()), `${name}: a porta abriu e saiu da frente`)
  check(await p.locator('.topbar').isVisible(), `${name}: o app aparece sem recarregar`)
  await p.waitForTimeout(800)
  await p.screenshot({ path: `${out}/${name}-6-dentro.png` })
  if (opts.sound) {
    const n = await p.evaluate(() => window.__sounds)
    // 3 batidas + vela + madeira + dobradiças
    check(n === 6, `${name}: com arquivos de som, tocaram ${n} de 6 sons`)
  }
  check(!errors.length, errors.length ? `${name}: erros no console: ${errors.join(' | ')}` : `${name}: nenhum erro no console`)
  await ctx.close()
}

await run('pc', { width: 1440, height: 900 }, { sound: true, frames: true })
await run('cel', { width: 390, height: 844 }, { touch: true })
await run('cel-deitado', { width: 844, height: 390 }, { touch: true })
await run('largo', { width: 1920, height: 1080 })
await run('movimento-reduzido', { width: 1280, height: 800 }, { reduced: true })
await b.close()
process.exit(fails ? 1 : 0)
