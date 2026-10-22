// O app compilado com o Supabase ligado (cliente oficial @supabase/supabase-js), falando
// com o "mini-Supabase" local (e2e/mini-supabase.mjs): PostgreSQL de verdade, com a
// migração do projeto e o RLS ativo. Dois navegadores independentes = dois aparelhos.
// Dados de teste só nestes navegadores e no banco temporário (apagado no fim).
// Uso: node e2e/nuvem-real.mjs   (precisa de PostgreSQL local; compila e serve sozinho)
import { createRequire } from 'node:module'
import { execSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { startMiniSupabase } from './mini-supabase.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const out = 'e2e/out/nuvem-real'
await mkdir(out, { recursive: true })
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}

const sb = await startMiniSupabase({ port: 54321 })
// compila com a nuvem apontando para o mini-Supabase (pasta separada: o dist de produção não muda)
execSync('npx vite build --outDir dist-nuvem --emptyOutDir', { stdio: 'pipe', env: { ...process.env, VITE_SUPABASE_URL: sb.url, VITE_SUPABASE_ANON_KEY: 'chave-publica-de-teste', VITE_ACERVO_ABERTO: '' } })
const web = spawn('npx', ['vite', 'preview', '--outDir', 'dist-nuvem', '--port', '4174', '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) {
  try {
    await fetch('http://localhost:4174/')
    break
  } catch {
    await new Promise((r) => setTimeout(r, 500))
  }
}
const app = 'http://localhost:4174/?debug&nuvem'
const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl'] })
const errors = []

async function device(name, vp, { seed = [], mobile = false } = {}) {
  const ctx = await b.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && !/Failed to fetch|net::ERR|WebSocket|realtime|404/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
  await p.goto(app)
  if (seed.length) {
    await p.evaluate((list) => new Promise((res, rej) => {
      const q = indexedDB.open('arquivo-das-sombras', 1)
      q.onupgradeneeded = () => { q.result.createObjectStore('stories', { keyPath: 'id' }); q.result.createObjectStore('meta') }
      q.onsuccess = () => { const t = q.result.transaction('stories', 'readwrite'); list.forEach((s) => t.objectStore('stories').put(s)); t.oncomplete = () => { q.result.close(); res() }; t.onerror = () => rej(t.error) }
    }), seed)
    await p.reload()
  }
  await p.waitForSelector('.cloud', { timeout: 120000 })
  return { p, ctx, name }
}
async function login(d, email) {
  await d.p.click('.cloud')
  await d.p.fill('.cloud-account input[type=email]', email)
  await d.p.click('.cloud-account button:has-text("enviar link")')
  await d.p.fill('.cloud-account input[aria-label="Código do e-mail"]', '123456')
  await d.p.click('.cloud-account button:has-text("entrar")')
  await d.p.waitForSelector('.cloud-account :text("Conectado como")', { timeout: 30000 })
  await d.p.click('.settings button:has-text("fechar")')
}
const local = (d) =>
  d.p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('arquivo-das-sombras')
    q.onsuccess = () => { const r = q.result.transaction('stories').objectStore('stories').getAll(); r.onsuccess = () => { q.result.close(); res(r.result) } }
  }))
const badge = (d) => d.p.textContent('.cloud')
const waitBadge = (d, re, timeout = 60000) => d.p.waitForFunction((s) => new RegExp(s).test(document.querySelector('.cloud')?.textContent || ''), re.source, { timeout, polling: 200 })
/** volta para a página (o app relê a nuvem): o mesmo que trocar de aba ou desbloquear o celular */
const back = (d) => d.p.evaluate(() => dispatchEvent(new Event('focus')))
const waitLocal = async (d, pred, what) => {
  for (let i = 0; i < 60; i++) {
    if (pred(await local(d))) return true
    await back(d)
    await new Promise((r) => setTimeout(r, 500))
  }
  check(false, what)
  return false
}
async function edit(d, title, text) {
  await d.p.click('.topbar button:has-text("Acervo")')
  await d.p.click(`.library li:has-text("${title}") button:has-text("editar")`)
  await d.p.fill('.editor .e-text', text)
  await d.p.waitForSelector('[data-testid=save-status]:has-text("guardado")')
}
// "fechar" grava sem mudar a situação (rascunho/finalizada), para comparar só o texto
const close = (d) => d.p.click('.editor .e-actions button:text-is("fechar")')

const EMAIL = 'caic@exemplo.com'
const old = { id: 'antiga1', t: 'A história que já existia', sub: 'sub — com travessão', x: 'Escrita antes da nuvem.\n\n“Aspas”, ação, coração.', tags: ['sombra'], st: 'f', note: 'nota', fav: true, del: false, c: 11, u: 22, o: 3, v: [{ t: 'A história', x: 'versão anterior', u: 5 }] }

try {
  // D: migração com o cliente oficial e o banco de verdade
  const pc = await device('pc', { width: 1280, height: 800 }, { seed: [old] })
  check(/entrar para salvar/.test(await badge(pc)), 'sem login: "entrar para salvar na nuvem"')
  await login(pc, EMAIL)
  await waitBadge(pc, /salvo na nuvem/)
  let rows = await sb.rows(EMAIL)
  check(rows.length === 1 && rows[0].id === 'antiga1' && rows[0].rev === 1, 'D: a história antiga está no PostgreSQL, revisão 1')
  // o PostgreSQL (jsonb) guarda as chaves em outra ordem: compara campo a campo
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))
  check(canon(rows[0].story) === canon((({ v, ...s }) => s)(old)) && canon(rows[0].v) === canon(old.v), 'D: conteúdo idêntico no banco (campos, acentos, versões)')
  await pc.p.reload()
  await pc.p.waitForSelector('.cloud', { timeout: 120000 })
  await waitBadge(pc, /salvo na nuvem/)
  rows = await sb.rows(EMAIL)
  check(rows.length === 1 && rows[0].rev === 1, 'D: recarregar (sessão mantida) não duplica nem regrava')

  // A: persistência
  await edit(pc, 'A história que já existia', 'Texto novo no computador.')
  await pc.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
  await close(pc)
  rows = await sb.rows(EMAIL)
  check(rows[0].story.x === 'Texto novo no computador.' && rows[0].rev === 2, 'A: a edição está no banco (revisão 2), confirmada antes de dizer "salvo na nuvem"')
  await pc.p.reload()
  await pc.p.waitForSelector('.cloud', { timeout: 120000 })
  await waitBadge(pc, /salvo na nuvem/)
  check((await local(pc)).find((s) => s.id === 'antiga1')?.x === 'Texto novo no computador.', 'A: depois de recarregar, o texto confere com o banco')

  // C + B: outro navegador, sem nada salvo, entra e recebe; edita e volta ao primeiro
  const cel = await device('cel', { width: 390, height: 844 }, { mobile: true })
  await login(cel, EMAIL)
  await waitLocal(cel, (l) => l.some((s) => s.id === 'antiga1' && s.x === 'Texto novo no computador.' && s.v?.length >= 1), 'C: celular recebeu o acervo do banco')
  check(true, 'C: celular (tela pequena, sem dados antes) entrou e recebeu o acervo')
  await cel.p.screenshot({ path: `${out}/cel-recebido.png` })
  await edit(cel, 'A história que já existia', 'Editado no celular.')
  await cel.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
  await close(cel)
  await waitLocal(pc, (l) => l.some((s) => s.id === 'antiga1' && s.x === 'Editado no celular.'), 'B: a edição do celular chegou ao computador')
  check(true, 'B: edição do celular chegou ao computador (ao voltar para a página)')

  // E: falha de conexão com o banco
  await pc.ctx.route(`${sb.url}/**`, (r) => r.abort())
  await edit(pc, 'A história que já existia', 'Sem conexão com o banco.')
  await waitBadge(pc, /erro ao salvar na nuvem/)
  check(true, 'E: sem conexão: ' + (await badge(pc)))
  await close(pc)
  check((await sb.rows(EMAIL))[0].story.x === 'Editado no celular.', 'E: nada foi gravado durante a falha')
  await pc.ctx.unroute(`${sb.url}/**`)
  await pc.p.evaluate(() => dispatchEvent(new Event('online')))
  await waitBadge(pc, /salvo na nuvem/, 90000)
  rows = await sb.rows(EMAIL)
  check(rows.length === 1 && rows[0].story.x === 'Sem conexão com o banco.', 'E: conexão de volta: a mudança pendente subiu')
  if (rows.length !== 1 || rows[0].story.x !== 'Sem conexão com o banco.') console.log(JSON.stringify(rows.map((r) => [r.id, r.rev, r.dev, r.story?.t, r.story?.x])), sb.log.filter((l) => /rpc/.test(l)).length)

  // F: concorrência real no banco (revisão conferida pela função)
  await waitLocal(cel, (l) => l.some((s) => s.x === 'Sem conexão com o banco.'), 'celular atualizado antes do teste de conflito')
  await cel.ctx.route(`${sb.url}/**`, (r) => r.abort())
  await edit(cel, 'A história que já existia', 'Versão do celular, offline.')
  await close(cel)
  await edit(pc, 'A história que já existia', 'Versão do computador.')
  await pc.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
  await close(pc)
  await cel.ctx.unroute(`${sb.url}/**`)
  await cel.p.evaluate(() => dispatchEvent(new Event('online')))
  await waitBadge(cel, /salvo na nuvem/, 90000)
  rows = await sb.rows(EMAIL)
  const xs = rows.map((r) => r.story?.x)
  check(xs.includes('Versão do computador.') && xs.includes('Versão do celular, offline.'), 'F: edição simultânea: as duas versões estão no banco')
  check(rows.some((r) => /cópia em conflito/.test(r.story?.t || '')), 'F: a segunda virou "(cópia em conflito)"')

  // F: segurança: outra conta e sem login
  const outro = await device('outro', { width: 1000, height: 700 })
  await login(outro, 'outra@exemplo.com')
  await waitBadge(outro, /salvo na nuvem/)
  await new Promise((r) => setTimeout(r, 1500))
  check((await local(outro)).length === 0, 'F: outra conta não recebe nada da primeira')
  const anon = await fetch(`${sb.url}/rest/v1/historias?select=*`, { headers: { apikey: 'chave-publica-de-teste' } })
  check(anon.status === 401 || (anon.ok && (await anon.json()).length === 0), `F: sem login a tabela não é lida (HTTP ${anon.status})`)
  check((await sb.rows('outra@exemplo.com')).length === 0 && (await sb.rows(EMAIL)).length === 2, 'F: banco: cada conta só com o seu')
} catch (e) {
  check(false, 'erro no teste: ' + e.message.split('\n')[0])
  console.log(sb.log.filter((l) => /put|rpc/.test(l)).join('\n'))
  for (const [i, pg] of b.contexts().flatMap((c) => c.pages()).entries()) await pg.screenshot({ path: `${out}/falha-${i}.png` }).catch(() => {})
}
check(!errors.length, 'sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
web.kill()
await sb.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
