// Capturas da Fase 5: folhas soltas na mesa, editor, acervo, ajustes, índice clicável e marcador.
// Dados de teste só neste navegador de teste.
// Uso: node e2e/fase5.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/fase5'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}

const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. Ela abriu o caderno onde guardava o que ninguém mais lembrava. '
const stories = [
  { id: 't1', t: 'A vela', sub: 'primeiro registro', x: (para.repeat(3) + '\n\n').repeat(5), st: 'f', o: 1, u: 5 },
  { id: 't2', t: 'O relógio parado', sub: '', x: para.repeat(4), st: 'd', o: 2, u: 9 },
  { id: 't3', t: 'Cartas que não foram enviadas', sub: 'três cartas', x: (para + '\n').repeat(12), st: 'f', o: 3, u: 3 },
  { id: 't4', t: 'Lista de coisas perdidas', sub: '', x: 'Um guarda-chuva, duas cartas, a chave do sótão.', st: 'd', o: 4, u: 7 },
].map((s) => ({ tags: [], note: '', fav: false, del: false, c: 1, ...s }))

const shot = async (p, name) => {
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
  await p.waitForTimeout(3000)
  await shot(p, `${name}-1-mesa`)

  // editor: nova folha
  await p.click('.topbar button:has-text("Escrever")')
  await p.fill('.editor .e-title', 'Noite de tempestade')
  await p.type('.editor .e-text', 'O trovão chegou antes da carta.', { delay: 15 })
  await p.waitForSelector('[data-testid=save-status]:has-text("guardado")')
  await shot(p, `${name}-2-editor`)
  await p.click('.editor button:has-text("modo foco")')
  await shot(p, `${name}-3-foco`)
  await p.click('.editor button:has-text("modo foco")')
  // enviar ao livro: abre o livro na história
  await p.click('.editor button:has-text("enviar ao livro")')
  await until(p, () => window.__book.cover === 1 && !window.__book.turn && !window.__book.jump)
  await p.waitForTimeout(2000)
  const pos = await p.textContent('[data-testid=pos]')
  await shot(p, `${name}-4-no-livro`)
  check(/\d/.test(pos), 'enviar ao livro abre na história nova: ' + pos)

  // marcador
  await p.click('.bookbar button:has-text("Marcar")')
  await p.waitForSelector('.bookbar button:has-text("Desmarcar")')
  await p.waitForTimeout(1500)
  await shot(p, `${name}-5-marcado`)

  // índice e clique numa entrada
  await p.click('.bookbar button:has-text("Índice")')
  await until(p, () => !window.__book.turn && !window.__book.jump && window.__book.spread === 1)
  await p.waitForTimeout(1500)
  await shot(p, `${name}-6-indice`)

  // fechar e ver "Continuar leitura" e o marcador na barra
  await p.click('.bookbar button:has-text("Fechar")')
  await until(p, () => window.__book.cover === 0)
  await p.waitForTimeout(1500)
  await shot(p, `${name}-7-fechado-marcador`)
  check((await p.$$('.bookbar .mark')).length === 1, 'marcador aparece com o livro fechado')

  // acervo e ajustes
  await p.click('.topbar button:has-text("Acervo")')
  await p.fill('.library input', 'trovão')
  await p.waitForTimeout(300)
  await shot(p, `${name}-8-acervo-busca`)
  check((await p.$$('[data-testid=list] li')).length === 1, 'busca no acervo encontra a história nova')
  await p.click('.sheet button:has-text("fechar")')
  await p.click('.topbar button:has-text("Ajustes")')
  await shot(p, `${name}-9-ajustes`)
  await p.click('.sheet button:has-text("fechar")')
  await p.click('.topbar button:has-text("Folhas soltas")')
  await shot(p, `${name}-10-folhas`)
  await p.close()
}

await run('pc', { width: 1440, height: 900 })
await run('cel', { width: 390, height: 844 })
check(errors.length === 0, 'nenhum erro no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
process.exit(failures ? 1 : 0)
