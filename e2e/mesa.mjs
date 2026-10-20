// Capturas da mesa: contorno de cada objeto clicável (livro, folhas, tinteiro, caixa, vela),
// fumaça da vela e o clique de cada objeto. Dados de teste só neste navegador de teste.
// Uso: node e2e/mesa.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/mesa'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
let failures = 0
const check = (ok, msg) => { if (!ok) failures++; console.log((ok ? 'OK    ' : 'FALHA ') + msg) }
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await p.goto(`http://localhost:${port}/?debug`)
await p.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('arquivo-das-sombras', 1)
  q.onupgradeneeded = () => { q.result.createObjectStore('stories', { keyPath: 'id' }); q.result.createObjectStore('meta') }
  q.onsuccess = () => { const t = q.result.transaction('stories', 'readwrite'); t.objectStore('stories').put({ id: 'r1', t: 'Rascunho', sub: '', x: 'Começo de uma história.', tags: [], note: '', fav: false, del: false, st: 'd', c: 1, u: 2, o: 1 }); t.oncomplete = () => { q.result.close(); res() } }
}))
await p.reload()
await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
await p.waitForTimeout(3000)
await p.screenshot({ path: `${out}/0-sem-contorno.png` })
for (const id of ['book', 'tinteiro', 'caixa', 'vela', 'folha:nova', 'folha:r1']) {
  await p.evaluate((id) => window.__hover(id), id)
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${out}/1-${id.replace(':', '-')}.png` })
  console.log('captura', id)
}
await p.evaluate(() => window.__hover(null))
// fumaça em vários instantes, de perto
for (const k of [0, 1, 2]) {
  await p.waitForTimeout(1300)
  await p.screenshot({ path: `${out}/2-fumaca-${k}.png`, clip: { x: 520, y: 200, width: 400, height: 420 } })
}
// cliques de verdade, com o mouse no centro de cada objeto na tela (medidas de src/scene)
const click = async (xyz) => {
  const [x, y] = await p.evaluate((v) => window.__project(...v), xyz)
  await p.mouse.move(x, y)
  await p.waitForTimeout(400)
  const cursor = await p.evaluate(() => document.body.style.cursor)
  await p.mouse.click(x, y)
  await p.waitForTimeout(500)
  return cursor
}
const close = () => p.keyboard.press('Escape').then(() => p.waitForTimeout(400))
let cur = await click([0.44, 0.79, -1.07])
check(cur === 'pointer' && !!(await p.$('.editor')), 'tinteiro: mãozinha e abre o editor')
await close()
cur = await click([-0.52, 0.8, -1.09])
check(cur === 'pointer' && !!(await p.$('.library')), 'caixa de fichas: mãozinha e abre o Acervo')
await close()
cur = await click([-0.25, 0.83, -1.0])
check(cur === 'pointer' && !!(await p.$('.settings')), 'vela: mãozinha e abre os Ajustes')
await close()
check(!(await p.$('.overlay')) && !(await p.$('.editor')), 'Esc fechou tudo')
check(errors.length === 0, 'nenhum erro no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
process.exit(failures ? 1 : 0)
