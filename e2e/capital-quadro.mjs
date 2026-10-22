// Letra capital dentro da caixa de três linhas: captura a primeira página de histórias que
// começam com letras difíceis (A, P, Q, É, M) e com número, na leitura em tela cheia (celular
// em pé, uma página por vez). Dados de teste só neste navegador de teste.
// Uso: node e2e/capital-quadro.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/capital-quadro'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []

const texts = [
  ['Estações', 'As estações passaram.\nJá é verão?\nNão me lembro.\nAlguma coisa ficou lá atrás.'],
  ['Caminho', 'Perdido no caminho, um culpado sem nome para dar, tentando entender como tudo o que aconteceu parece tão distante agora.'],
  ['Ação', '1, 2, 3 e ação.\nQue se abra o pano — ou que ele me enforque logo, tanto faz.'],
  ['Quarto', 'Quando a porta abriu, ninguém entrou. Só o frio, e um cheiro de cera queimada pela casa.'],
  ['Épocas', 'É tarde demais para voltar, mas cedo demais para esquecer o que ficou guardado.'],
  ['Medo', 'Medo não é o que se sente no escuro; é o que se lembra quando a luz volta.'],
]
const stories = texts.map(([t, x], i) => ({ id: 'q' + i, t, sub: '', x, st: 'f', o: i + 1, tags: [], note: '', fav: false, del: false, c: 1, u: 1 }))

const until = (p, fn) => p.waitForFunction(fn, undefined, { timeout: 120000, polling: 200 })
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
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
await p.waitForTimeout(2000)
const box = await p.locator('.flat-reader canvas').boundingBox()
for (let k = 1; k <= texts.length + 1; k++) {
  await p.evaluate(() => window.__book.step(1))
  await until(p, () => !window.__book.turn)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${out}/pagina-${k}.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 420) } })
  console.log('captura', `pagina-${k}`)
}
console.log(errors.length ? 'ERROS: ' + errors.join(' | ') : 'sem erros no console')
await b.close()
process.exit(errors.length ? 1 : 0)
