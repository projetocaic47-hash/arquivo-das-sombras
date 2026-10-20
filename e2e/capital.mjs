// Captura da primeira página de uma história: letra capital, recuo, diálogo e pausa de cena.
// Dados de teste só neste navegador de teste.
// Uso: node e2e/capital.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/capital'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []

// escrito sem cuidado de propósito: hífen no diálogo, aspas retas, três pontos, linhas em branco
const x = [
  'a chuva batia na janela desde o anoitecer , e a vela era a unica coisa acesa na casa. Ela abriu o caderno onde guardava o que ninguém mais lembrava...',
  '',
  '- Quem está ai? - perguntou, sem levantar os olhos.',
  '',
  'Ninguém respondeu. Só o vento, e o "tique-taque" do relógio parado há anos.',
  '***',
  'Na manhã seguinte, o caderno estava aberto numa página que ela nunca tinha escrito.',
].join('\n')
const stories = [
  { id: 't1', t: 'A vela', sub: 'primeiro registro', x, st: 'f', o: 1 },
  { id: 't2', t: 'O relógio parado', sub: '', x: '"Era tarde." Ela sabia.', st: 'f', o: 2 },
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
  await p.evaluate(() => window.__book.open())
  await until(p, () => window.__book.cover === 1)
  for (const k of [1, 2]) {
    await p.evaluate(() => window.__book.step(1))
    await until(p, () => !window.__book.turn)
    await p.waitForTimeout(1200)
    await p.screenshot({ path: `${out}/${name}-${k}.png` })
    console.log('captura', `${name}-${k}`)
  }
  await p.close()
}
await run('pc', { width: 1440, height: 900 })
await run('cel', { width: 390, height: 844 })
console.log(errors.length ? 'ERROS: ' + errors.join(' | ') : 'sem erros no console')
await b.close()
