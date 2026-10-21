// Efeitos sonoros: destrava no primeiro gesto, um som por interação (sem duplicar), nenhum
// som preso, som desligado e volume guardados, áudio quebrado sem erro, e gravação offline
// de todos os sons (pico, fim sem corte seco, todos juntos sem saturar). Grava os .wav em
// e2e/out/sons/ para ouvir. Dados de teste só neste navegador de teste.
// Uso: node e2e/sons.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/sons'
await mkdir(out, { recursive: true })
// sem a flag de autoplay: o navegador exige um gesto, como na vida real
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}
const para = 'A chuva batia na janela desde o anoitecer, e a vela era a única coisa acesa na casa. '
const stories = [
  { id: 's1', t: 'Primeira', x: para.repeat(6), o: 1, u: 1 },
  { id: 's2', t: 'Segunda', x: para.repeat(6), o: 2, u: 2 },
  { id: 's3', t: 'Terceira', x: para.repeat(6), o: 3, u: 3 },
].map((s) => ({ sub: '', tags: [], st: 'f', note: '', fav: false, del: false, c: 1, ...s }))

async function open(ctx, seed) {
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await p.goto(`http://localhost:${port}/?debug`)
  if (seed) {
    await p.evaluate((list) => new Promise((res, rej) => {
      const q = indexedDB.open('arquivo-das-sombras', 1)
      q.onupgradeneeded = () => { q.result.createObjectStore('stories', { keyPath: 'id' }); q.result.createObjectStore('meta') }
      q.onsuccess = () => { const t = q.result.transaction('stories', 'readwrite'); list.forEach((s) => t.objectStore('stories').put(s)); t.oncomplete = () => { q.result.close(); res() }; t.onerror = () => rej(t.error) }
    }), stories)
    await p.reload()
  }
  await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
  return { p, errors }
}

// ---------------------------------------------------------------- 1. gravação offline
{
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${port}/?debug`)
  await p.waitForFunction(() => window.__sfx)
  const names = await p.evaluate(() => window.__sfx.names)
  const res = await p.evaluate(async (names) => {
    const o = []
    for (const n of names) o.push(await window.__sfx.render(n, undefined, false, true))
    o.push({ ...(await window.__sfx.render('ui.tick', { on: false }, false, true)), names: ['ui.tick-desligar'] })
    o.push({ ...(await window.__sfx.render('ribbon.mark', { down: true }, false, true)), names: ['ribbon.mark-desmarcar'] })
    for (const n of ['book.close', 'door.hinges']) o.push({ ...(await window.__sfx.render(n, undefined, true, true)), names: [n + '-reduzido'] })
    return o
  }, names)
  for (const r of res) {
    await writeFile(`${out}/${r.names[0]}.wav`, Buffer.from(r.wav, 'base64'))
    // o pó do cartaz termina com estalinhos isolados (cada um com o seu próprio decaimento)
    const tailOk = r.names[0].startsWith('door.poster') || r.tailPeak / r.peak < 0.05
    check(!r.nan && r.peak > 0.02 && r.peak < 0.6 && tailOk, `${r.names[0]}: pico ${r.peak.toFixed(2)}, ${r.audible.toFixed(2)} s, fim em ${((r.tailPeak / r.peak) * 100).toFixed(1)}% do pico`)
  }
  const all = await p.evaluate((names) => window.__sfx.render(names), names)
  check(!all.nan && all.peak < 0.95, `todos os ${names.length} sons ao mesmo tempo, volume máximo: pico ${all.peak.toFixed(2)} (abaixo de 1, sem saturar)`)
  const knocks = await p.evaluate(() => window.__sfx.render(['page.turn', 'page.turn', 'page.flick', 'paper.crumple', 'book.thud', 'door.knock']))
  check(knocks.peak < 0.95, `rajada de sons fortes juntos: pico ${knocks.peak.toFixed(2)}`)
  await ctx.close()
}

// ---------------------------------------------------------------- 2. no app, som ligado
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
const { p, errors } = await open(ctx, true)
const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 120000, polling: 100 })
const log = () => p.evaluate(() => window.__sfx.log.map((e) => e.name))
check((await p.evaluate(() => window.__sfx.state())) === 'none', 'antes de qualquer gesto, nenhum áudio é criado')

/** Faz a ação e confere que o(s) som(ns) esperados tocaram exatamente uma vez cada. */
async function act(what, fn, expected, wait = 400) {
  const n0 = (await log()).length
  await fn()
  await p.waitForTimeout(wait)
  const got = (await log()).slice(n0)
  const ok = expected.every((e) => got.filter((g) => g === e).length === 1) && got.length === expected.length
  check(ok, `${what}: ${got.join(', ') || 'nenhum som'}${ok ? '' : ` (esperado: ${expected.join(', ')})`}`)
}

await act('abrir o Acervo', () => p.click('.topbar button:has-text("Acervo")'), ['box.open'])
check(['running', 'suspended'].includes(await p.evaluate(() => window.__sfx.state())), `o primeiro clique destrava o áudio (estado: ${await p.evaluate(() => window.__sfx.state())})`)
await until(() => window.__sfx.state() === 'running').then(() => check(true, 'áudio rodando depois do gesto'), () => check(false, 'áudio rodando depois do gesto'))
// dois cliques no mesmo instante (toque duplo, evento repetido): um som só
await act('favoritar duas vezes no mesmo instante', () => p.evaluate(() => { const bt = document.querySelector('.library [aria-label="favoritar"]'); bt.click(); bt.click() }), ['ui.tick'])
await act('mudar a ordem', () => p.click('.library [aria-label="descer"] >> nth=0'), ['ui.tick'])
await act('fechar o Acervo', () => p.click('.library button:has-text("fechar")'), ['box.close'])
await act('abrir os Ajustes', () => p.click('.topbar button:has-text("Ajustes")'), ['candle.breath'])
await act('fechar os Ajustes', () => p.click('.settings button:has-text("fechar")'), ['panel.close'])
await act('abrir as Folhas soltas', () => p.click('.topbar button:has-text("Folhas soltas")'), ['paper.pick'])
await act('fechar as Folhas soltas', () => p.keyboard.press('Escape'), ['panel.close'])
await act('abrir o editor', () => p.click('.topbar button:has-text("Escrever")'), ['quill.dip'])
await act('modo foco', () => p.click('.editor button:has-text("modo foco")'), ['ui.tick'])
await act('sair do modo foco (Esc)', () => p.keyboard.press('Escape'), [])
await act('fechar o editor', () => p.click('.editor button:has-text("fechar")'), ['panel.close'])

await act('abrir o livro', () => p.click('button:has-text("Abrir o livro")'), ['book.open'], 300)
await until(() => window.__book.cover === 1 && !window.__book.turn && !window.__book.jump)
await act('virar a página', () => p.click('[aria-label="Próxima página"]'), ['page.turn'], 200)
await until(() => !window.__book.turn && !window.__book.jump)
{
  const n0 = (await log()).length
  await p.click('.bookbar button:has-text("história »")')
  await until(() => !window.__book.turn && !window.__book.jump)
  const got = (await log()).slice(n0)
  check(got.length >= 1 && got.every((g) => g === 'page.flick' || g === 'page.turn'), `pular para a próxima história: ${got.length} folhas (${[...new Set(got)].join(', ')})`)
}
await act('marcar a página', () => p.click('.bookbar button:has-text("Marcar")'), ['ribbon.mark'], 800)
await act('excluir esta (pergunta)', () => p.click('.bookbar button:has-text("Excluir esta")'), ['dialog.open'])
await act('manter', () => p.click('.modal button:has-text("Manter")'), ['dialog.cancel'])
{
  // a capa desce no ritmo dos quadros (devagar no navegador de teste): espera ela assentar
  const n0 = (await log()).length
  await p.click('.bookbar button:has-text("Fechar")')
  await until(() => window.__book.cover === 0)
  await p.waitForTimeout(300)
  const got = (await log()).slice(n0)
  check(got.join() === 'book.close,book.thud', `fechar o livro: ${got.join(', ')} (a capa desce e assenta)`)
}
await p.waitForTimeout(2500)
check((await p.evaluate(() => window.__sfx.live())) === 0, 'depois de tudo, nenhum som preso tocando')

// ---------------------------------------------------------------- 3. desligar, volume e persistência
await p.click('.topbar button:has-text("Ajustes")')
await p.click('.settings label:has-text("Efeitos sonoros") input')
check(!(await p.isChecked('.settings label:has-text("Efeitos sonoros") input')), 'ajuste "Efeitos sonoros" desligado')
check(await p.isDisabled('.settings label:has-text("Volume") input'), 'com o som desligado, o volume fica inativo')
await p.screenshot({ path: `${out}/ajustes-desligado.png` })
await p.click('.settings button:has-text("fechar")')
const n0 = (await log()).length
await p.click('.topbar button:has-text("Acervo")')
await p.waitForSelector('.library')
await p.click('.library button:has-text("fechar")')
await p.waitForTimeout(300)
const muted = await p.evaluate((n) => window.__sfx.log.slice(n), n0)
check(muted.length === 2 && muted.every((e) => e.muted) && (await p.evaluate(() => window.__sfx.live())) === 0, 'som desligado: o Acervo abre e fecha normalmente e nada toca')
await p.reload()
await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
await p.click('.topbar button:has-text("Ajustes")')
check(!(await p.isChecked('.settings label:has-text("Efeitos sonoros") input')), 'depois de recarregar, o som continua desligado')
await p.click('.settings label:has-text("Efeitos sonoros") input')
await p.locator('.settings label:has-text("Volume") input').fill('30')
await p.waitForTimeout(200)
await p.screenshot({ path: `${out}/ajustes-ligado.png` })
await p.reload()
await p.waitForSelector('[data-ready=true]', { timeout: 120000 })
await p.click('.topbar button:has-text("Ajustes")')
const vol = await p.locator('.settings label:has-text("Volume") input').inputValue()
check((await p.isChecked('.settings label:has-text("Efeitos sonoros") input')) && vol === '30', `depois de recarregar: som ligado e volume ${vol}%`)
check(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem('arquivo-som')))) === '{"on":true,"vol":0.3}', 'preferência guardada fora do IndexedDB (localStorage "arquivo-som")')
const stored = await p.evaluate(() => new Promise((res) => {
  const q = indexedDB.open('arquivo-das-sombras')
  q.onsuccess = () => { const r = q.result.transaction('stories').objectStore('stories').getAll(); r.onsuccess = () => { q.result.close(); res({ v: q.result.version, n: r.result.length }) } }
}))
check(stored.n === 3 && stored.v === 1, `IndexedDB intacto: versão ${stored.v}, ${stored.n} histórias`)
check(!errors.length, 'som ligado: sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await ctx.close()

// ---------------------------------------------------------------- 4. áudio quebrado
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript(() => {
    const Broken = function () { throw new Error('áudio indisponível (teste)') }
    window.AudioContext = Broken
    window.webkitAudioContext = Broken
  })
  const { p, errors } = await open(ctx, false)
  await p.click('.topbar button:has-text("Acervo")')
  await p.waitForSelector('.library')
  await p.click('.library button:has-text("fechar")')
  await p.click('.topbar button:has-text("Ajustes")')
  await p.waitForSelector('.settings')
  await p.click('.settings button:has-text("fechar")')
  await p.click('button:has-text("Abrir o livro")')
  await p.waitForFunction(() => window.__book.cover === 1, null, { timeout: 120000 })
  check((await p.evaluate(() => window.__sfx.state())) === 'broken' && !errors.length, `sem Web Audio: o app funciona em silêncio, sem erros (${errors.join(' | ') || 'nenhum'})`)
  await ctx.close()
}

await b.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
