// Capturas do livro: fechado, abrindo, aberto e a folha em vários pontos da virada,
// nos dois sentidos, no computador e no celular. Dados de teste só neste navegador de teste.
// Uso: node e2e/book.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const only = process.argv[3]
const out = 'e2e/out/livro'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []

const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. Ela abriu o caderno onde guardava o que ninguém mais lembrava. '
const stories = [
  { id: 't1', t: 'A vela', sub: 'primeiro registro', x: (para.repeat(3) + '\n\n').repeat(5), st: 'f', o: 1 },
  { id: 't2', t: 'O relógio parado', sub: '', x: para.repeat(4), st: 'd', o: 2 },
  { id: 't3', t: 'Cartas que não foram enviadas', sub: 'três cartas', x: (para + '\n').repeat(12), st: 'f', o: 3 },
].map((s) => ({ tags: [], note: '', fav: false, del: false, c: 1, u: 1, ...s }))

async function shot(p, name) {
  await p.screenshot({ path: `${out}/${name}.png` })
  console.log('captura', name)
}
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 120000, polling: 200 })

async function run(name, vp) {
  const p = await b.newPage({ viewport: vp })
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto(`http://localhost:${port}/?debug`)
  await p.evaluate((list) => new Promise((res, rej) => {
    const q = indexedDB.open('arquivo-das-sombras', 1)
    q.onupgradeneeded = () => { q.result.createObjectStore('stories', { keyPath: 'id' }); q.result.createObjectStore('meta') }
    q.onsuccess = () => { const t = q.result.transaction('stories', 'readwrite'); list.forEach((s) => t.objectStore('stories').put(s)); t.oncomplete = () => { q.result.close(); res() }; t.onerror = () => rej(t.error) }
  }), stories)
  await p.reload()
  await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
  await until(p, () => window.__book && window.__book.pages.length > 3)
  await p.waitForTimeout(1500)
  await shot(p, `${name}-1-fechado`)
  await p.evaluate(() => window.__book.open())
  await until(p, () => window.__book.cover > 0.45)
  await shot(p, `${name}-2-abrindo`)
  await until(p, () => window.__book.cover === 1)
  await p.waitForTimeout(2500)
  await shot(p, `${name}-3-aberto`)
  // folha avançando, parada em pontos da virada (como se segurada pelo dedo)
  const pts = name === 'pc' ? [0.12, 0.3, 0.5, 0.7, 0.88] : [0.3, 0.6]
  await p.evaluate(() => window.__book.beginDrag(1))
  for (const v of pts) {
    await p.evaluate((v) => { const t = window.__book.turn; t.p = t.target = v }, v)
    await p.waitForTimeout(700)
    await shot(p, `${name}-4-virando-${Math.round(v * 100)}`)
  }
  await p.evaluate(() => window.__book.endDrag(2))
  await until(p, () => !window.__book.turn)
  await p.evaluate(() => window.__book.step(1))
  await until(p, () => !window.__book.turn)
  await p.waitForTimeout(800)
  await shot(p, `${name}-5-historia`)
  if (name === 'pc') {
    // voltando
    await p.evaluate(() => window.__book.beginDrag(-1))
    for (const v of [0.75, 0.4]) {
      await p.evaluate((v) => { const t = window.__book.turn; t.p = t.target = v }, v)
      await p.waitForTimeout(700)
      await shot(p, `${name}-6-voltando-${Math.round(v * 100)}`)
    }
    await p.evaluate(() => window.__book.endDrag(-2))
    await until(p, () => !window.__book.turn)
    await p.evaluate(() => window.__book.close())
    await until(p, () => window.__book.cover < 0.5)
    await shot(p, `${name}-7-fechando`)
  }
  await p.close()
}
if (!only || only === 'pc') await run('pc', { width: 1440, height: 900 })
if (!only || only === 'cel') await run('cel', { width: 390, height: 844 })
if (only === 'hd') await run('hd', { width: 1920, height: 1080 })
console.log(errors.length ? 'erros:\n' + [...new Set(errors)].join('\n') : 'sem erros no console')
await b.close()
