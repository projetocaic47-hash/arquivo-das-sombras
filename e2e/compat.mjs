// Teste de compatibilidade de ponta a ponta com o HTML original, num navegador real (Chromium).
// Uso: node e2e/compat.mjs <caminho do HTML original>
// Serve o original e a nova app (dist/) no MESMO endereço, como o IndexedDB exige.
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { extname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))

const original = resolve(process.argv[2])
const dist = resolve('dist')
const out = resolve('e2e/out')
await mkdir(out, { recursive: true })
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = path === '/original.html' ? original : join(dist, path === '/' ? 'index.html' : path)
  try {
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404).end()
  }
}).listen(0)
const base = `http://localhost:${server.address().port}`

let failures = 0
const check = (ok, msg) => {
  console.log((ok ? 'OK   ' : 'FALHA') + ' ' + msg)
  if (!ok) failures++
}

const browser = await chromium.launch()
const errors = []
const page = async (ctx) => {
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return p
}

// 1. Dados criados pelo próprio original, pela interface dele
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
const o = await page(ctx)
await o.goto(base + '/original.html')
await o.waitForTimeout(1500)
const write = async (t, x, finished) => {
  await o.evaluate(() => openEd())
  await o.fill('#et', t)
  await o.fill('#ex', x)
  await o.fill('#eg', 'noite, chuva')
  await o.selectOption('#ez', finished ? 'f' : 'd')
  await o.evaluate(() => flush())
  await o.evaluate(() => closeP())
}
await write('A vela', 'Era uma noite escura e a chuva batia no vidro.', true)
await write('Rascunho perdido', 'Algumas linhas soltas.', false)
await write('Para a lixeira', 'Isto vai para a lixeira.', true)
await o.evaluate(async () => { const s = S.find((s) => s.t === 'Para a lixeira'); s.del = true; await put(s) })
await o.evaluate(async () => { C.n = 'ACERVO DE TESTE'; C.bm = [{ sid: S[0].id, off: 0 }]; await saveC() })
const originalStories = await o.evaluate(() => JSON.parse(JSON.stringify(S)))
const originalBackup = await o.evaluate(() => JSON.stringify({ app: 'arquivo-das-sombras', v: 1, exported: new Date().toISOString(), config: C, stories: S }, null, 1))
await o.close()

// Desde a Fase 3 o painel de dados fica atrás do botão "Acervo", por cima do quarto 3D
const openPanel = async (pg) => { await pg.click('.topbar button:has-text("Acervo")'); await pg.waitForSelector('[data-testid=stats]') }
// nome do acervo: campo dos Ajustes (o painel do Acervo fica aberto de volta)
const nameOf = async (pg) => {
  await pg.click('.sheet button:has-text("fechar")')
  await pg.click('.topbar button:has-text("Ajustes")')
  const v = await pg.inputValue('.settings label:has-text("Nome do acervo") input')
  await pg.click('.sheet button:has-text("fechar")')
  await openPanel(pg)
  return v
}

// 2. A nova app, no mesmo endereço, enxerga exatamente esses dados
const n = await page(ctx)
await n.goto(base + '/?debug') // ?debug pula a porta de entrada
await openPanel(n)
const stats = await n.textContent('[data-testid=stats]')
check(stats.startsWith('2 histórias'), 'nova app conta 2 histórias visíveis: ' + stats)
check(stats.includes('1 rascunhos') && stats.includes('1 na lixeira'), 'rascunho e lixeira reconhecidos')
check((await nameOf(n)) === 'ACERVO DE TESTE', 'nome do acervo vindo dos ajustes do original')
const listed = await n.$$eval('[data-testid=list] b', (bs) => bs.map((b) => b.textContent))
check(JSON.stringify(listed) === JSON.stringify(['A vela', 'Rascunho perdido']), 'títulos na ordem do livro: ' + listed.join(', '))
const raw = await n.evaluate(() => new Promise((r) => { const q = indexedDB.open('arquivo-das-sombras'); q.onsuccess = () => { const d = q.result; const t = d.transaction(['stories', 'meta']); const a = t.objectStore('stories').getAll(); const c = t.objectStore('meta').get('cfg'); t.oncomplete = () => { r({ v: d.version, stores: [...d.objectStoreNames], stories: a.result, cfg: c.result }); d.close() } } }))
check(raw.v === 1 && raw.stores.join() === 'meta,stories', 'banco continua na versão 1 com as mesmas gavetas')
const sortById = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id))
check(JSON.stringify(sortById(raw.stories)) === JSON.stringify(sortById(originalStories)), 'registros idênticos byte a byte depois de abrir a nova app')
await n.screenshot({ path: join(out, 'nova-app.png') })

// 3. A nova app exporta um backup que o original aceita
const [dl] = await Promise.all([n.waitForEvent('download'), n.click('text=Backup do acervo')])
const exported = await readFile(await dl.path(), 'utf8')
check(dl.suggestedFilename().startsWith('arquivo-das-sombras-backup-'), 'nome do arquivo de backup: ' + dl.suggestedFilename())
await n.close()

const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const o2 = await page(ctx2)
await o2.goto(base + '/original.html')
await o2.waitForTimeout(1500)
await o2.evaluate((t) => restore(t), exported)
await o2.click('#cm button[data-i="0"]')
await o2.click('#cm button[data-i="0"]')
await o2.waitForTimeout(500)
const back = await o2.evaluate(() => JSON.parse(JSON.stringify(S)))
check(JSON.stringify(sortById(back)) === JSON.stringify(sortById(originalStories)), 'original restaura o backup gerado pela nova app sem perdas')
await o2.close()

// 4. Backup do original importado na nova app, num navegador vazio
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const n3 = await page(ctx3)
await n3.goto(base + '/?debug')
await openPanel(n3)
check((await n3.textContent('[data-testid=stats]')).startsWith('0 histórias'), 'navegador novo começa vazio')
const [chooser] = await Promise.all([n3.waitForEvent('filechooser'), n3.click('text=Restaurar backup')])
await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(originalBackup) })
await n3.click('text=Substituir o acervo atual')
await n3.click('text=Sim, substituir')
await n3.waitForSelector('text=Acervo restaurado: 3 histórias.')
// como no original, o painel fecha depois de restaurar
await openPanel(n3)
check((await n3.textContent('[data-testid=stats]')).startsWith('2 histórias'), 'importação do backup do original: 2 visíveis + 1 na lixeira')
check((await nameOf(n3)) === 'ACERVO DE TESTE', 'configuração restaurada junto')
// recarregar: os dados persistem
await n3.reload()
await openPanel(n3)
check((await n3.textContent('[data-testid=stats]')).startsWith('2 histórias'), 'dados continuam após recarregar')
await n3.screenshot({ path: join(out, 'nova-app-celular.png') })
// arquivo inválido não altera nada
const [c2] = await Promise.all([n3.waitForEvent('filechooser'), n3.click('text=Restaurar backup')])
await c2.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"outro"}') })
await n3.waitForSelector('text=Arquivo inválido ou incompleto. Nada foi alterado.')
check((await n3.textContent('[data-testid=stats]')).startsWith('2 histórias'), 'arquivo inválido recusado sem alterar o acervo')

// 5. Fase 5: escrever e editar na nova app; o original lê tudo igual
await n3.click('.sheet button:has-text("fechar")')
await n3.click('.topbar button:has-text("Escrever")')
await n3.fill('.editor .e-title', 'Nova da fase 5')
await n3.fill('.editor .e-text', 'Primeira linha.\n\nSegundo parágrafo com acentuação: ação, coração.')
await n3.fill('.editor [aria-label=Etiquetas]', 'chuva, teste')
await n3.waitForSelector('[data-testid=save-status]:has-text("guardado")')
await n3.click('.editor button:has-text("deixar na mesa")')
await n3.waitForSelector('.editor', { state: 'detached' })
await openPanel(n3)
check((await n3.textContent('[data-testid=stats]')).startsWith('3 histórias'), 'história nova gravada pelo editor')
// editar uma existente pelo acervo, com a versão anterior guardada
await n3.click('[data-testid=list] li:has-text("A vela") button:has-text("editar")')
await n3.fill('.editor .e-text', 'Texto reescrito na nova app.')
await n3.click('.editor button:has-text("fechar")')
await n3.waitForSelector('.editor', { state: 'detached' })
// favoritar, mandar o rascunho para a lixeira e trocar a ordem
await openPanel(n3)
await n3.click('[data-testid=list] li:has-text("A vela") button[aria-label=favoritar]')
await n3.click('[data-testid=list] li:has-text("Rascunho perdido") button:has-text("lixeira")')
await n3.click('[data-testid=list] li:has-text("Nova da fase 5") button[aria-label=subir]')
await n3.waitForTimeout(400)
const order = await n3.$$eval('[data-testid=list] b', (bs) => bs.map((b) => b.textContent))
check(JSON.stringify(order) === JSON.stringify(['Nova da fase 5', 'A vela']), 'ordem trocada e lixeira: ' + order.join(', '))
const o3 = await page(ctx3)
await o3.goto(base + '/original.html')
await o3.waitForTimeout(1500)
const seen = await o3.evaluate(() => JSON.parse(JSON.stringify(S)))
const nova = seen.find((s) => s.t === 'Nova da fase 5')
check(!!nova && nova.st === 'd' && nova.tags.join() === 'chuva,teste' && nova.x.includes('coração') && typeof nova.o === 'number' && !('_new' in nova), 'original lê a história escrita na nova app com os mesmos campos')
const vela = seen.find((s) => s.t === 'A vela')
check(vela.x === 'Texto reescrito na nova app.' && vela.fav === true && vela.v?.[0]?.x === 'Era uma noite escura e a chuva batia no vidro.', 'original lê a edição, o favorito e a versão anterior')
check(seen.find((s) => s.t === 'Rascunho perdido').del === true, 'original vê o rascunho na lixeira')
const vis = await o3.evaluate(() => vis().map((s) => s.t))
check(JSON.stringify(vis) === JSON.stringify(['Nova da fase 5', 'A vela']), 'original mostra a mesma ordem do livro: ' + vis.join(', '))
await o3.close()

check(errors.length === 0, 'nenhum erro no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await browser.close()
server.close()
console.log(failures ? `${failures} verificação(ões) falharam` : 'Todas as verificações passaram')
process.exit(failures ? 1 : 0)
