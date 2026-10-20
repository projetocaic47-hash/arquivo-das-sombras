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
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
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

  if (name === 'pc') {
    // som: começa no primeiro clique; chuva, piano e trovão medidos na saída
    await p.mouse.click(200, 300)
    await p.waitForTimeout(6000)
    const s0 = await p.evaluate(() => window.__sound.probe())
    check(s0.state === 'running' && s0.rain > 0, 'áudio liberado pelo clique e chuva tocando: ' + JSON.stringify(s0))
    check(s0.piano === 18, 'amostras do piano carregadas: ' + s0.piano)
    // medidor fora da linha principal (a cena 3D em software trava a página): RMS a cada 50 ms do relógio do áudio
    await p.evaluate(async () => {
      const s = window.__sound
      const ac = s.ctx
      const code = `class M extends AudioWorkletProcessor{constructor(){super();this.a=0;this.n=0}process(i){const c=i[0][0];if(c){for(let k=0;k<c.length;k++)this.a+=c[k]*c[k];this.n+=c.length;if(this.n>=2205){this.port.postMessage([currentTime,Math.sqrt(this.a/this.n)]);this.a=0;this.n=0}}return true}};registerProcessor('medidor',M)`
      await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })))
      const node = new AudioWorkletNode(ac, 'medidor')
      s.master.connect(node)
      window.__lv = []
      node.port.onmessage = (e) => window.__lv.push(e.data)
    })
    const now = () => p.evaluate(() => window.__sound.ctx.currentTime)
    /** maior nível entre os instantes t0 e t1 do áudio (espera o áudio chegar lá) */
    const level = async (t0, t1) => {
      await p.waitForFunction((t1) => window.__lv.length && window.__lv[window.__lv.length - 1][0] >= t1, t1, { timeout: 120000, polling: 250 })
      return p.evaluate(([t0, t1]) => Math.max(0, ...window.__lv.filter(([t]) => t >= t0 && t <= t1).map(([, r]) => r)), [t0, t1])
    }
    // relâmpagos automáticos parados durante as medidas, para um trovão não cair no meio
    await p.evaluate(() => { window.__atmos.forceLightning = 0 })
    await p.evaluate(() => window.__sound.setPrefs({ music: false }))
    let t = (await now()) + 3
    const rain = await level(t, t + 2)
    // o instante é lido junto com o disparo: a página pode demorar a responder
    t = await p.evaluate(() => (window.__sound.thunder(4, 0), window.__sound.ctx.currentTime))
    const storm = await level(t, t + 3)
    check(rain > 0.003 && storm > rain * 2, `trovão bem acima da chuva (chuva ${rain.toFixed(4)}, trovão ${storm.toFixed(4)})`)
    await p.evaluate(() => window.__sound.setPrefs({ on: false }))
    t = (await now()) + 3
    const off = await level(t, t + 0.5)
    check(off < 0.001, 'som desligado fica em silêncio: ' + off.toFixed(5))
    // como com o editor aberto: a chuva recua para a escrita aparecer
    await p.evaluate(() => { window.__sound.setPrefs({ on: true, music: false }); window.__sound.setWriting(true) })
    t = (await now()) + 3
    const before = await level(t, t + 1)
    t = await p.evaluate(() => { for (let i = 0; i < 8; i++) window.__sound.key(i === 7 ? 'enter' : 'char'); return window.__sound.ctx.currentTime })
    const keys = await level(t, t + 0.6)
    check(keys > before * 1.3, `máquina de escrever soa ao digitar (chuva ${before.toFixed(4)}, tecla ${keys.toFixed(4)})`)
    // espera a campainha da máquina acabar antes de medir o lápis
    await p.evaluate(() => window.__sound.setPrefs({ writing: 'lapis' }))
    await level(t + 1.6, t + 1.7)
    t = await p.evaluate(() => (window.__sound.key('char'), window.__sound.ctx.currentTime))
    const pencil = await level(t, t + 0.5)
    check(pencil > before * 1.1, `lápis soa ao digitar (chuva ${before.toFixed(4)}, lápis ${pencil.toFixed(4)})`)
    await p.evaluate(() => { window.__sound.setPrefs({ writing: 'maquina', music: true }); window.__sound.setWriting(false); window.__atmos.forceLightning = -1 })
    t = (await now()) + 6
    const piano = await level(t, t + 8)
    check(piano > before, `piano tocando por cima da chuva (${piano.toFixed(4)})`)
  }

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
