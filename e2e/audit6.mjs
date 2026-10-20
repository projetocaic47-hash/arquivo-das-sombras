// Revisão da Fase 6: tamanhos de tela, teclado, recarregar e navegador sem WebGL.
// Dados de teste só neste navegador de teste.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = process.argv[3] || 'e2e/out/fase6'
await mkdir(out, { recursive: true })
const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. '
const stories = [
  { id: 't1', t: 'A vela', sub: 'primeiro registro', x: (para.repeat(4) + '\n').repeat(6), st: 'f', o: 1 },
  { id: 't2', t: 'O relógio parado', sub: '', x: para.repeat(3), st: 'd', o: 2 },
].map((s) => ({ tags: [], note: '', fav: false, del: false, c: 1, u: 1, ...s }))
const seed = (p) => p.evaluate((list) => new Promise((res, rej) => {
  const q = indexedDB.open('arquivo-das-sombras', 1)
  q.onupgradeneeded = () => { q.result.createObjectStore('stories', { keyPath: 'id' }); q.result.createObjectStore('meta') }
  q.onsuccess = () => { const t = q.result.transaction('stories', 'readwrite'); list.forEach((s) => t.objectStore('stories').put(s)); t.oncomplete = () => { q.result.close(); res() }; t.onerror = () => rej(t.error) }
}), stories)
const log = (...a) => console.log(...a)
const mode = process.argv[4] || 'all'

if (mode === 'all' || mode === 'sizes') {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  for (const [w, h] of [[1920, 1080], [1024, 768], [768, 1024], [844, 390], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    const errs = []
    p.on('pageerror', (e) => errs.push(e.message))
    await p.goto(`http://localhost:${port}/?debug`)
    await seed(p); await p.reload()
    await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
    await p.waitForTimeout(2500)
    await p.screenshot({ path: `${out}/tam-${w}x${h}-mesa.png` })
    await p.evaluate(() => window.__book.open())
    await p.waitForFunction(() => window.__book.cover === 1, undefined, { timeout: 120000 })
    await p.evaluate(() => window.__book.step(1)); await p.waitForFunction(() => !window.__book.turn, undefined, { timeout: 120000 })
    await p.waitForTimeout(1500)
    await p.screenshot({ path: `${out}/tam-${w}x${h}-livro.png` })
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    log(`${w}x${h}`, 'rolagem horizontal:', over, 'erros:', errs.length)
    await p.close()
  }
  await b.close()
}

if (mode === 'all' || mode === 'keys') {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
  await p.goto(`http://localhost:${port}/?debug`)
  await seed(p); await p.reload()
  await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
  const order = []
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20) || document.activeElement?.tagName)) }
  log('ordem do Tab:', order.join(' | '))
  await p.click('.topbar button:has-text("Acervo")')
  log('foco ao abrir o acervo:', await p.evaluate(() => (document.activeElement?.closest('.sheet') ? 'dentro do painel' : 'fora: ' + document.activeElement?.tagName)))
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  log('Esc fecha o acervo:', !(await p.$('.sheet')))
  await p.click('.topbar button:has-text("Escrever")')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  log('Esc fecha o editor:', !(await p.$('.editor')))
  if (await p.$('.editor')) await p.click('.editor button:has-text("fechar")')
  await p.screenshot({ path: `${out}/teclado.png` })
  // recarregar no meio da leitura
  await p.evaluate(() => window.__book.open())
  await p.waitForFunction(() => window.__book.cover === 1, undefined, { timeout: 120000 })
  for (let i = 0; i < 2; i++) { await p.keyboard.press('ArrowRight'); await p.waitForFunction(() => !window.__book.turn, undefined, { timeout: 120000 }) }
  const before = await p.textContent('[data-testid=pos]')
  await p.waitForTimeout(2500)
  await p.reload()
  await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
  await p.waitForTimeout(800)
  const cont = await p.$('.bookbar button:has-text("Continuar leitura")')
  log('antes de recarregar:', before, '· "Continuar leitura" depois:', !!cont)
  if (cont) { await cont.click(); await p.waitForFunction(() => window.__book.cover === 1 && !window.__book.turn && !window.__book.jump, undefined, { timeout: 120000 }); log('voltou para:', await p.textContent('[data-testid=pos]')) }
  await b.close()
}

if (mode === 'all' || mode === 'nogl') {
  const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-gpu', '--disable-software-rasterizer'] })
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await p.goto(`http://localhost:${port}/?debug`)
  await seed(p); await p.reload()
  await p.waitForTimeout(6000)
  await p.screenshot({ path: `${out}/sem-webgl.png` })
  log('sem WebGL · barra do alto:', !!(await p.$('.topbar')), '· texto da tela:', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 160))
  await p.click('.topbar button:has-text("Acervo")')
  await p.click('[data-testid=list] li:first-child button:has-text("ler")')
  await p.waitForSelector('.reader')
  await p.screenshot({ path: `${out}/sem-webgl-leitura.png` })
  log('sem WebGL · leitura simples abre:', !!(await p.$('.reader')))
  log('erros:', errs.slice(0, 3).join(' | ').slice(0, 300))
  await b.close()
}
