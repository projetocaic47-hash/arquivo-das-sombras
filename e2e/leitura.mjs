// Leitura em tela cheia: abre o livro, vira páginas, captura a folha no meio da virada.
// Dados de teste só neste navegador de teste.
// Uso: node e2e/leitura.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/leitura'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
let fails = 0
const check = (ok, what) => {
  console.log((ok ? 'OK    ' : 'FALHA ') + what)
  if (!ok) fails++
}

const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. Ela abriu o caderno onde guardava o que ninguém mais lembrava, e as letras pareciam mudar de lugar quando a chama tremia.'
const x = Array.from({ length: 9 }, (_, i) => (i % 3 === 1 ? '— Quem está aí? — perguntou, sem levantar os olhos.' : para)).join('\n')
const stories = [
  { id: 't1', t: 'A vela', sub: 'primeiro registro', x, st: 'f', o: 1 },
  { id: 't2', t: 'O relógio parado', sub: '', x: para + '\n' + para, st: 'f', o: 2 },
].map((s) => ({ tags: [], note: '', fav: false, del: false, c: 1, u: 1, ...s }))

const until = (p, fn) => p.waitForFunction(fn, undefined, { timeout: 120000, polling: 200 })
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
  await until(p, () => window.__book && window.__book.pages.length > 2)
  await p.getByRole('button', { name: 'Abrir o livro' }).click()
  await p.waitForSelector('.flat-reader canvas', { timeout: 60000 })
  await until(p, () => window.__book.cover === 1 && window.__book.flat)
  check(true, `${name}: leitura em tela cheia abriu`)
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${out}/${name}-1-indice.png` })
  // vai para a primeira página da história
  await p.evaluate(() => window.__book.step(1))
  await until(p, () => !window.__book.turn)
  const single = await p.evaluate(() => window.__book.single)
  if (single) {
    await p.evaluate(() => window.__book.step(1))
    await until(p, () => !window.__book.turn)
  }
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${out}/${name}-2-historia.png` })
  // folha parada no meio da virada, segurada pelo arraste
  const before = await p.evaluate(() => window.__book.page)
  await p.evaluate(() => { window.__book.beginDrag(1); window.__book.dragTo(0.42) })
  await p.waitForTimeout(2500)
  await p.screenshot({ path: `${out}/${name}-3-virando.png` })
  await p.evaluate(() => window.__book.dragTo(0.75))
  await p.waitForTimeout(2000)
  await p.screenshot({ path: `${out}/${name}-4-virando.png` })
  await p.evaluate(() => window.__book.endDrag(1))
  await until(p, () => !window.__book.turn)
  const after = await p.evaluate(() => window.__book.page)
  check(after > before, `${name}: a folha arrastada virou (${before} → ${after})`)
  // toque na metade direita vira
  const box = await p.locator('.flat-reader canvas').boundingBox()
  await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5)
  await p.waitForTimeout(300)
  await until(p, () => !window.__book.turn)
  const tapped = await p.evaluate(() => window.__book.page)
  check(tapped > after, `${name}: toque à direita vira a página (${after} → ${tapped})`)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${out}/${name}-5-depois.png` })
  await p.getByRole('button', { name: 'Fechar' }).click()
  await p.waitForTimeout(500)
  check(!(await p.locator('.flat-reader').count()), `${name}: Fechar sai da tela cheia`)
  await p.close()
}
await run('pc', { width: 1440, height: 900 })
await run('cel', { width: 390, height: 844 })
check(!errors.length, errors.length ? 'erros no console: ' + errors.join(' | ') : 'nenhum erro no console')
await b.close()
process.exit(fails ? 1 : 0)
