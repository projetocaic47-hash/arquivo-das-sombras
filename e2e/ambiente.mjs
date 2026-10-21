// Chuva e trovões de fundo + rangido da porta: carga só depois do gesto, uma chuva só,
// navegação sem reiniciar, volume sem reiniciar, silenciar e reativar, aba escondida e de
// volta (simulada), emenda do loop sem buraco, nível da mixagem sem saturar, porta
// sincronizada e sem duplicar, e o mesmo no celular emulado (toque).
// Uso: node e2e/ambiente.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium, devices } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const base = `http://localhost:${port}`
await mkdir('e2e/out/ambiente', { recursive: true })
// sem a flag de autoplay: o navegador exige um gesto
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}
const db = (x) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1)

async function open(path, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, ...opts })
  const p = await ctx.newPage()
  const errors = []
  const audioReqs = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  p.on('request', (r) => /sons\/.*\.mp3/.test(r.url()) && audioReqs.push(r.url().replace(/.*\//, '')))
  await p.goto(base + path)
  return { ctx, p, errors, audioReqs }
}
const amb = (p) => p.evaluate(() => window.__amb.state())

// ---------------------------------------------------------------- 1. emenda e nível (offline)
{
  const { ctx, p } = await open('/?debug')
  await p.waitForFunction(() => window.__amb)
  const r = await p.evaluate(async () => {
    const dec = async (f, sr) => new OfflineAudioContext(2, 1, sr).decodeAudioData(await (await fetch('sons/' + f)).arrayBuffer())
    const sr = 48000
    const rain = await dec('chuva.mp3', sr)
    const oc = new OfflineAudioContext(2, 1, sr)
    const loop = window.__amb.seamless(oc, rain)
    const rms = (d, a, n) => { let s = 0; for (let i = a; i < a + n; i++) s += d[(i + d.length) % d.length] ** 2; return Math.sqrt(s / n) }
    const d = loop.getChannelData(0)
    // menor energia em janelas de 10 ms ao redor da emenda vs. o normal da chuva
    const w = 480
    let seamMin = Infinity
    for (let k = -10; k < 10; k++) seamMin = Math.min(seamMin, rms(d, k * w, w))
    let typMin = Infinity
    for (let k = 0; k < 400; k++) typMin = Math.min(typMin, rms(d, 100000 + k * w, w))
    // salto entre a última e a primeira amostra vs. salto típico entre amostras vizinhas
    let typJump = 0
    for (let i = 1; i < 48000; i++) typJump = Math.max(typJump, Math.abs(d[100000 + i] - d[100000 + i - 1]))
    const seamJump = Math.abs(d[0] - d[d.length - 1])
    // sem o tratamento: as pontas do MP3 (ms de silêncio de codificação)
    const raw = rain.getChannelData(0)
    const rawEdge = Math.min(rms(raw, 0, w), rms(raw, raw.length - w, w))
    // mixagem: chuva + trovões no volume padrão e no máximo, pelo mesmo caminho do app
    const mix = async (vol) => {
      const thunder = await dec('trovoes.mp3', sr)
      const len = thunder.length
      const m = new OfflineAudioContext(2, len, sr)
      const lim = m.createDynamicsCompressor()
      Object.assign(lim, {})
      lim.threshold.value = -14; lim.knee.value = 8; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.2
      const master = m.createGain(); master.gain.value = vol * 0.8
      const bus = m.createGain(); bus.gain.value = 0.8
      master.connect(lim).connect(m.destination); bus.connect(master)
      const s1 = m.createBufferSource(); s1.buffer = window.__amb.seamless(m, rain); s1.loop = true
      const g1 = m.createGain(); g1.gain.value = 0.25; s1.connect(g1).connect(bus); s1.start()
      const s2 = m.createBufferSource(); s2.buffer = thunder
      const g2 = m.createGain(); g2.gain.value = 0.14; s2.connect(g2).connect(bus); s2.start()
      const out = await m.startRendering()
      const o = out.getChannelData(0)
      let peak = 0, s = 0
      for (let i = 0; i < o.length; i++) { peak = Math.max(peak, Math.abs(o[i])); s += o[i] * o[i] }
      return { peak, rms: Math.sqrt(s / o.length) }
    }
    return { len: loop.duration, seamMin, typMin, seamJump, typJump, rawEdge, padrao: await mix(0.7), maximo: await mix(1) }
  })
  check(r.seamMin > r.typMin * 0.7, `loop da chuva (${r.len.toFixed(2)} s): sem queda na emenda (mínimo ${db(r.seamMin)} dB, normal da chuva ${db(r.typMin)} dB)`)
  check(r.seamJump < r.typJump, `loop da chuva: sem estalo na volta (salto ${r.seamJump.toFixed(4)}, maior salto normal ${r.typJump.toFixed(4)})`)
  check(r.rawEdge < r.typMin * 0.5, `sem o tratamento, as pontas do arquivo teriam um buraco (${db(r.rawEdge)} dB): por isso o corte e o crossfade`)
  check(r.padrao.peak < 0.5, `mixagem no volume padrão: pico ${db(r.padrao.peak)} dBFS, média ${db(r.padrao.rms)} dBFS`)
  check(r.maximo.peak < 0.9, `mixagem com tudo no máximo: pico ${db(r.maximo.peak)} dBFS (sem saturar), média ${db(r.maximo.rms)} dBFS`)
  await ctx.close()
}

// ---------------------------------------------------------------- 2. no app (computador)
{
  const { ctx, p, errors, audioReqs } = await open('/?debug')
  await p.waitForSelector('[data-ready=true]', { timeout: 180000 })
  await p.waitForTimeout(1000)
  check(!audioReqs.length && !(await amb(p)).active, 'antes do primeiro gesto: nada toca e nenhum áudio é baixado')
  await p.click('.topbar button:has-text("Acervo")')
  await p.waitForFunction(() => window.__amb.state().rain && !window.__amb.state().thunderPaused, null, { timeout: 30000 })
  const s1 = await amb(p)
  check(s1.active && s1.rainStarts === 1 && s1.ctx === 'running', `primeiro clique: chuva e trovões começam (contexto ${s1.ctx}), com fade de entrada`)
  check(audioReqs.filter((x) => x === 'chuva.mp3').length === 1 && audioReqs.includes('trovoes.mp3'), `arquivos baixados só agora, uma vez cada: ${audioReqs.join(', ')}`)
  // navegar não reinicia nada
  const t0 = (await amb(p)).thunderTime
  for (let i = 0; i < 3; i++) {
    await p.click('.library button:has-text("fechar")')
    await p.click('.topbar button:has-text("Ajustes")')
    await p.click('.settings button:has-text("fechar")')
    await p.click('.topbar button:has-text("Acervo")')
  }
  await p.click('.library button:has-text("fechar")')
  await p.waitForTimeout(1500)
  const s2 = await amb(p)
  check(s2.rainStarts === 1 && s2.thunderTime > t0, `abrir e fechar janelas 3 vezes: uma chuva só, trovões seguem (${t0.toFixed(1)} s → ${s2.thunderTime.toFixed(1)} s)`)
  await p.click('button:has-text("Abrir o livro")')
  await p.waitForFunction(() => window.__book.cover === 1, null, { timeout: 120000 })
  await p.waitForTimeout(800)
  const s3 = await amb(p)
  check(s3.rainStarts === 1 && s3.thunderTime > s2.thunderTime && !s3.thunderPaused, 'abrir o livro: a chuva continua, sem reiniciar')
  await p.click('.bookbar button:has-text("Fechar")')
  await p.waitForFunction(() => window.__book.cover === 0, null, { timeout: 120000 })
  // volume da chuva: muda sem reiniciar
  await p.click('.topbar button:has-text("Ajustes")')
  await p.locator('.settings label:has-text("Volume da chuva") input').fill('40')
  await p.waitForTimeout(500)
  const s4 = await amb(p)
  check(Math.abs(s4.gain - 0.4) < 0.02 && s4.rainStarts === 1 && !s4.thunderPaused, `volume da chuva em 40%: nível ${s4.gain.toFixed(2)}, sem reiniciar`)
  await p.screenshot({ path: 'e2e/out/ambiente/ajustes.png' })
  // silenciar e reativar
  await p.click('.settings label:has-text("Som (efeitos") input')
  await p.waitForTimeout(1300)
  const s5 = await amb(p)
  check(!s5.active && !s5.rain && s5.thunderPaused === null, 'som desligado: chuva e trovões somem num fade, param e liberam a memória')
  check(await p.isDisabled('.settings label:has-text("Chuva e trovões") input'), 'som desligado: a opção da chuva fica inativa')
  await p.click('.settings label:has-text("Som (efeitos") input')
  await p.waitForFunction(() => window.__amb.state().rain && !window.__amb.state().thunderPaused, null, { timeout: 30000 })
  const s6 = await amb(p)
  check(s6.active && s6.rainStarts === 2, 'som religado: a ambientação volta (uma chuva nova, não duas)')
  // só a chuva
  await p.click('.settings label:has-text("Chuva e trovões") input')
  await p.waitForTimeout(1300)
  check(!(await amb(p)).active, 'chuva desligada nos Ajustes (efeitos continuam ligados)')
  await p.click('.settings label:has-text("Chuva e trovões") input')
  await p.waitForFunction(() => window.__amb.state().rain, null, { timeout: 30000 })
  check((await amb(p)).active, 'chuva religada')
  await p.click('.settings button:has-text("fechar")')
  // aba escondida e de volta (simulado: este navegador de teste não esconde abas de verdade)
  await p.waitForTimeout(1000)
  const before = await amb(p)
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await p.waitForTimeout(1500)
  const hidden = await amb(p)
  check(!hidden.active && hidden.thunderPaused && hidden.ctx === 'suspended', `aba escondida: fade, trovões pausados e áudio suspenso (contexto ${hidden.ctx})`)
  await p.waitForTimeout(1500)
  const stillHidden = await amb(p)
  check(Math.abs(stillHidden.thunderTime - hidden.thunderTime) < 0.05, 'aba escondida: nada avança (sem gastar CPU)')
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await p.waitForTimeout(1500)
  const back = await amb(p)
  check(back.active && back.ctx === 'running' && !back.thunderPaused && back.rainStarts === before.rainStarts && back.thunderTime >= hidden.thunderTime, `aba de volta: retoma de onde parou (trovões em ${back.thunderTime.toFixed(1)} s), sem reiniciar`)
  check(!errors.length, 'computador: sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await ctx.close()
}

// ---------------------------------------------------------------- 3. porta: rangido sincronizado
async function door(label, opts, touch) {
  const { ctx, p, errors } = await open('/?debug&porta', opts)
  await p.evaluate(() => {
    // registra quando cada som de arquivo começa (relógio do áudio) e o atraso pedido
    window.__starts = []
    const st = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (when = 0, ...a) {
      const c = this.context
      if (this.buffer && this.buffer.duration > 4 && this.buffer.duration < 5 && this.buffer.numberOfChannels === 1) window.__starts.push({ delay: when - c.currentTime, at: performance.now() })
      return st.call(this, when, ...a)
    }
  })
  const ent = p.locator('.entrance')
  await ent.waitFor()
  await p.waitForTimeout(1000)
  const tap = async (spot) => {
    const bx = await p.locator(`[data-spot=${spot}]`).boundingBox()
    if (touch) await p.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2)
    else await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2)
  }
  for (let i = 0; i < 3; i++) { await tap('door'); await p.waitForTimeout(250) }
  await p.waitForFunction(() => window.__amb.state().rain, null, { timeout: 30000 }).catch(() => {})
  check((await amb(p)).active, `${label}: a primeira batida destrava o áudio e a chuva começa`)
  await tap('candle')
  await p.waitForTimeout(3000)
  const rain0 = await amb(p)
  const openAt = await p.evaluate(() => performance.now())
  await tap('poster')
  // toques repetidos no cartaz e na porta durante a abertura
  for (let i = 0; i < 4; i++) {
    await p.waitForTimeout(150)
    await tap(i % 2 ? 'door' : 'poster').catch(() => {})
  }
  await p.waitForTimeout(2500)
  const starts = await p.evaluate(() => window.__starts)
  const log = await p.evaluate(() => window.__sfx.log.map((e) => e.name))
  check(starts.length === 1, `${label}: o rangido gravado tocou ${starts.length} vez(es) mesmo com toques repetidos`)
  if (starts.length) {
    const s = starts[0]
    // a abertura começa 0,9 s depois do toque no cartaz (o rangido da madeira vem antes)
    const fromOpen = (s.at - openAt) / 1000 - 0.9 + s.delay
    check(Math.abs(s.delay - 1.0) < 0.06, `${label}: rangido agendado no relógio do áudio para ${s.delay.toFixed(2)} s depois do início da abertura (porta começa a girar em 1,25 s; rangido audível a partir de ~1,1 s)`)
    check(fromOpen > 0.8 && fromOpen < 1.5, `${label}: medido do toque no cartaz, o rangido começa ${fromOpen.toFixed(2)} s após o início da abertura`)
  }
  check(log.filter((n) => n === 'door.creak').length === 1 && log.filter((n) => n === 'door.unlatch').length === 1, `${label}: um tranco e um rangido, sem duplicar (${log.slice(-3).join(', ')})`)
  await p.waitForSelector('.entrance', { state: 'detached', timeout: 20000 }).catch(() => {})
  const rain1 = await amb(p)
  check(rain1.rainStarts === rain0.rainStarts && rain1.thunderTime > rain0.thunderTime && rain1.active, `${label}: a porta abre e a chuva segue sem interrupção`)
  await p.waitForTimeout(1500)
  check((await p.evaluate(() => window.__sfx.live())) === 0, `${label}: sons da porta encerrados ao entrar (fade), nada preso`)
  check(!errors.length, `${label}: sem erros no console` + (errors.length ? ': ' + errors.join(' | ') : ''))
  await ctx.close()
}
await door('porta no computador', {}, false)
const px = devices['Pixel 7']
await door('porta no celular (Pixel 7, toque)', { viewport: px.viewport, deviceScaleFactor: px.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: px.userAgent }, true)

await b.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
