// Capturas de tela da cena para avaliação (Chromium sem placa de vídeo: lento, mas fiel ao WebGL).
// Uso: node e2e/shots.mjs [porta]   (requer `npm run preview` ou outro servidor do dist/)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const url = `http://localhost:${port}/?debug`
await mkdir('e2e/out', { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
for (const [name, vp, flash] of [['quarto-1440', { width: 1440, height: 900 }, -1], ['quarto-relampago', { width: 1440, height: 900 }, 1.2], ['quarto-celular', { width: 390, height: 844 }, -1]]) {
  const p = await b.newPage({ viewport: vp })
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()))
  const t0 = Date.now()
  await p.goto(url)
  await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
  await p.evaluate((f) => (window.__atmos.forceLightning = f), flash)
  await p.waitForTimeout(4000)
  const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(n / 3) }; requestAnimationFrame(f) }))
  await p.screenshot({ path: `e2e/out/${name}.png` })
  console.log(name, 'pronto em', Date.now() - t0, 'ms; quadros/s (software):', fps.toFixed(1))
  await p.close()
}
console.log(errors.length ? 'mensagens:\n' + [...new Set(errors)].join('\n') : 'sem erros no console')
await b.close()
