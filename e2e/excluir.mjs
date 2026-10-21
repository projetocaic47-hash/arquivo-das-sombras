// Botão "Excluir esta" no livro: pergunta, manda a história à vista para a lixeira e o livro
// deixa de mostrá-la. Dados de teste só neste navegador de teste.
// Uso: node e2e/excluir.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/excluir'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}
const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. '
const stories = [
  { id: 'e1', t: 'Primeira', x: para.repeat(3), o: 1, u: 1 },
  { id: 'e2', t: 'Segunda', x: para.repeat(3), o: 2, u: 2 },
].map((s) => ({ sub: '', tags: [], st: 'f', note: '', fav: false, del: false, c: 1, ...s }))

const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
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
const until = (fn) => p.waitForFunction(fn, null, { timeout: 120000, polling: 200 })
await until(() => window.__book && window.__book.pages.length > 3)
const pagesBefore = await p.evaluate(() => window.__book.pages.filter((x) => x.k === 'story' && x.first).length)
await p.click('button:has-text("Abrir o livro")')
await until(() => window.__book.cover === 1 && !window.__book.turn && !window.__book.jump)
await p.click('.bookbar button:has-text("história »")')
await until(() => !window.__book.turn && !window.__book.jump)
await p.waitForSelector('.bookbar button:has-text("Excluir esta")')
await p.click('.bookbar button:has-text("Excluir esta")')
await p.waitForSelector('text=vai para a lixeira')
await p.screenshot({ path: `${out}/1-pergunta.png` })
// "Manter" não muda nada
await p.click('button:has-text("Manter")')
await p.waitForTimeout(500)
check((await p.evaluate(() => window.__book.pages.filter((x) => x.k === 'story' && x.first).length)) === pagesBefore, '"Manter" não exclui nada')
await p.click('.bookbar button:has-text("Excluir esta")')
await p.click('button:has-text("Excluir"):not(:has-text("esta"))')
await until(() => window.__book.pages.filter((x) => x.k === 'story' && x.first).length === 1)
check(true, 'a história sumiu do livro')
const stored = await p.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('arquivo-das-sombras')
  q.onsuccess = () => { const r = q.result.transaction('stories').objectStore('stories').getAll(); r.onsuccess = () => { q.result.close(); res(r.result) } }
}))
check(stored.length === 2 && stored.filter((s) => s.del).length === 1, 'ficou guardada na lixeira (dá para recuperar): ' + stored.map((s) => `${s.t}${s.del ? ' (lixeira)' : ''}`).join(', '))
await p.waitForTimeout(1000)
await p.screenshot({ path: `${out}/2-depois.png` })
check(!errors.length, 'sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
