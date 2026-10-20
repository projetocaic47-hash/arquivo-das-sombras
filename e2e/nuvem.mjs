// Nuvem com dois aparelhos (dois navegadores separados, cada um com o seu IndexedDB).
// O banco do claude.ai só existe no link publicado; aqui ele é imitado por um banco em
// memória neste processo, com a mesma interface (doc/collection/get/set/acquire/onSnapshot,
// entrega por consulta periódica). Isto testa o app e o adaptador; o serviço real do
// claude.ai precisa ser conferido no link publicado, em dois aparelhos de verdade.
// Dados de teste só nestes navegadores de teste.
// Uso: node e2e/nuvem.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/nuvem'
await mkdir(out, { recursive: true })
// sem o quarto 3D (o app segue igual, só mais leve): três aparelhos ao mesmo tempo num computador só
const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl'] })
const errors = []
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}

// o "servidor": documentos por caminho
const store = new Map()
const leases = new Map()
const offline = new Set()
const parent = (p) => p.split('/').slice(0, -1).join('/')

async function device(name, vp, seed = []) {
  const ctx = await b.newContext({ viewport: vp })
  const guard = () => {
    if (offline.has(name)) throw new Error('sem conexão')
  }
  await ctx.exposeFunction('__dbGet', (p) => (guard(), store.get(p) ?? null))
  await ctx.exposeFunction('__dbSet', (p, d) => {
    guard()
    if (JSON.stringify(d).length > 256 * 1024) throw Object.assign(new Error('grande'), { code: 'invalid_argument' })
    store.set(p, d)
  })
  await ctx.exposeFunction('__dbList', (c) => (guard(), [...store].filter(([p]) => parent(p) === c).map(([p, d]) => ({ id: p.split('/').pop(), d }))))
  await ctx.exposeFunction('__dbAcquire', (p, holder, ttl) => {
    guard()
    const l = leases.get(p)
    if (l && l.until > Date.now() && l.holder !== holder) return false
    leases.set(p, { holder, until: Date.now() + ttl })
    return true
  })
  await ctx.addInitScript(() => {
    const snap = (id, d) => ({ id, exists: !!d, data: () => (d ? structuredClone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: false } })
    const poll = (read, next, err) => {
      let last = null
      let dead = false
      const tick = async () => {
        if (dead) return
        try {
          const v = await read()
          const j = JSON.stringify(v)
          if (j !== last) {
            last = j
            next(v)
          }
        } catch {
          // sem conexão: tenta de novo na próxima volta, como o banco real
        }
        if (!dead) setTimeout(tick, 400)
      }
      tick()
      return () => (dead = true)
    }
    const doc = (path) => ({
      id: path.split('/').pop(),
      path,
      get: async () => snap(path.split('/').pop(), await window.__dbGet(path)),
      set: (d) => window.__dbSet(path, d),
      acquire: async (o) => ({ acquired: await window.__dbAcquire(path, o.holder, o.ttlMs || 30000) }),
      onSnapshot: (next, err) => poll(async () => snap(path.split('/').pop(), await window.__dbGet(path)), next, err),
      collection: (c) => col(`${path}/${c}`),
    })
    const col = (path) => ({
      path,
      doc: (id) => doc(`${path}/${id}`),
      onSnapshot: (next, err) =>
        poll(async () => {
          const l = await window.__dbList(path)
          const docs = l.map((x) => snap(x.id, x.d))
          return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, docChanges: () => [] }
        }, next, err),
    })
    const db = { doc, collection: col }
    const user = { id: async () => 'pessoa-teste' }
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) }
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  await p.goto(`http://localhost:${port}/?debug`)
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

/** As histórias gravadas no IndexedDB deste aparelho (o que sobrevive a fechar o navegador). */
const local = (d) =>
  d.p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('arquivo-das-sombras')
    q.onsuccess = () => { const r = q.result.transaction('stories').objectStore('stories').getAll(); r.onsuccess = () => { q.result.close(); res(r.result) } }
  }))
const badge = (d) => d.p.textContent('.cloud')
const waitBadge = (d, re) => d.p.waitForFunction((s) => new RegExp(s).test(document.querySelector('.cloud')?.textContent || ''), re.source, { timeout: 30000, polling: 200 })
const waitLocal = async (d, pred, what) => {
  for (let i = 0; i < 100; i++) {
    if (pred(await local(d))) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  check(false, what)
  return false
}
const cloudStories = () => [...store].filter(([p]) => p.includes('/arquivo/historias/')).map(([, d]) => d)

async function write(d, title, text) {
  await d.p.click('.topbar button:has-text("Escrever")')
  await d.p.fill('.editor .e-title', title)
  await d.p.fill('.editor .e-text', text)
  await d.p.waitForSelector('[data-testid=save-status]:has-text("guardado")')
  await d.p.click('.editor button:has-text("deixar na mesa")')
}

const old = { id: 'antiga1', t: 'A história que já existia', sub: '', x: 'Escrita antes da nuvem.', tags: [], st: 'f', note: '', fav: false, del: false, c: 1, u: 1, o: 1, v: [{ t: 'A história', x: 'versão anterior', u: 1 }] }

// 1. computador com um acervo antigo: tudo sobe para a nuvem, nada se perde
const pc = await device('pc', { width: 1280, height: 800 }, [old])
await waitBadge(pc, /salvo na nuvem/)
const up = cloudStories().find((c) => c.id === 'antiga1')
check(!!up && up.story.x === 'Escrita antes da nuvem.' && up.v?.length === 1, 'acervo que já existia subiu para a nuvem, com as versões')
check((await local(pc)).length === 1, 'IndexedDB do computador continua com a história')
await pc.p.screenshot({ path: `${out}/pc-1-salvo.png` })

// 2. celular novo: recebe o acervo
const cel = await device('cel', { width: 390, height: 844 })
await waitLocal(cel, (l) => l.some((s) => s.id === 'antiga1' && s.x === 'Escrita antes da nuvem.' && s.v?.length === 1), 'celular recebeu a história do computador')
console.log('OK    celular recebeu a história do computador e gravou no IndexedDB dele')
await waitBadge(cel, /salvo na nuvem/)
await cel.p.screenshot({ path: `${out}/cel-1-recebido.png` })

// 3. escrever no celular aparece no computador, sem recarregar
await write(cel, 'Escrita no celular', 'Uma linha nova, do celular.')
await waitLocal(pc, (l) => l.some((s) => s.t === 'Escrita no celular' && s.x === 'Uma linha nova, do celular.'), 'história do celular apareceu no computador')
console.log('OK    história escrita no celular apareceu no computador')

// 4. celular sem internet: fica pendente, guardada no aparelho, e sobe quando volta
offline.add('cel')
await write(cel, 'Escrita sem internet', 'No metrô.')
await waitBadge(cel, /pendentes/)
check(/pendentes/.test(await badge(cel)), 'sem internet o aviso diz "alterações pendentes": ' + (await badge(cel)))
check(!cloudStories().some((c) => c.story?.t === 'Escrita sem internet'), 'nada foi para a nuvem enquanto estava sem internet')
check((await local(cel)).some((s) => s.t === 'Escrita sem internet'), 'a história ficou guardada no celular')
await cel.p.screenshot({ path: `${out}/cel-2-pendente.png` })
// recarregar ainda sem internet: a fila não se perde
await cel.p.reload()
await cel.p.waitForSelector('.cloud', { timeout: 120000 })
await waitBadge(cel, /pendentes/)
check(true, 'depois de recarregar sem internet, a mudança continua pendente')
offline.delete('cel')
await cel.p.evaluate(() => dispatchEvent(new Event('online')))
await waitBadge(cel, /salvo na nuvem/)
await waitLocal(pc, (l) => l.some((s) => s.t === 'Escrita sem internet'), 'mudança feita sem internet chegou ao computador')
console.log('OK    a conexão voltou: a mudança subiu e chegou ao computador')
check(cloudStories().filter((c) => c.story?.t === 'Escrita sem internet').length === 1, 'sem duplicar na nuvem')

// 5. um aparelho que nunca abriu o app vê tudo (outro navegador, recuperação completa)
const tab = await device('tablet', { width: 820, height: 1180 })
await waitLocal(tab, (l) => ['A história que já existia', 'Escrita no celular', 'Escrita sem internet'].every((t) => l.some((s) => s.t === t)), 'terceiro aparelho recuperou as três histórias')
console.log('OK    terceiro aparelho recuperou as três histórias')

// 6. fora do claude.ai (sem nuvem): o app avisa que guarda só neste aparelho
const plain = await b.newPage({ viewport: { width: 1000, height: 700 } })
await plain.goto(`http://localhost:${port}/?debug`)
await plain.waitForSelector('.cloud', { timeout: 120000 })
check(/só neste aparelho/.test(await plain.textContent('.cloud')), 'sem a nuvem do claude.ai: "só neste aparelho"')

check(!errors.length, 'sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
