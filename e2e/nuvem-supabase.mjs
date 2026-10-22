// Nuvem Supabase com aparelhos independentes (navegadores separados, cada um com o seu
// IndexedDB e a sua sessão). O Supabase de verdade não é alcançável deste ambiente; aqui ele
// é imitado por um servidor em memória neste processo, com as mesmas regras do banco
// (supabase/migrations): cada conta só vê o seu, e a gravação confere a revisão
// (put_historia). As regras do banco em si são testadas num PostgreSQL real por
// scripts/test-nuvem-sql.sh. Isto testa o app, o adaptador, o login e a sincronização.
// Dados de teste só nestes navegadores de teste.
// Uso: node e2e/nuvem-supabase.mjs [porta]   (com `npx vite preview --port 4173` rodando)
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))
const port = process.argv[2] || '4173'
const out = 'e2e/out/nuvem-supabase'
await mkdir(out, { recursive: true })
const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl'] })
const errors = []
let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'OK    ' : 'FALHA ') + msg)
}

// ---- o "servidor": tabelas por conta, revisão conferida, fila de mudanças para o tempo real
const historias = new Map() // `${owner}|${id}` -> linha
const ajustes = new Map() // owner -> linha
const changes = [] // { seq, table, owner, row }
const offline = new Set()
let seq = 0
let rpcCalls = 0
const CODE = '123456'
const SENHA = 'senha-do-acervo'
const userId = (email) => 'u-' + email.replace(/[^a-z0-9]/gi, '-')
const pushChange = (table, owner, row) => changes.push({ seq: ++seq, table, owner, row: structuredClone(row) })

function serve(device, op, a) {
  if (offline.has(device)) return { error: { message: 'Failed to fetch' } }
  if (op === 'otp') return { error: null }
  if (op === 'password') return a.password === SENHA ? { session: { user: { id: userId(a.email), email: a.email } } } : { error: { message: 'Invalid login credentials' } }
  if (op === 'verify') return a.token === CODE ? { session: { user: { id: userId(a.email), email: a.email } } } : { error: { message: 'Token has expired or is invalid' } }
  const owner = a.owner
  if (!owner) return { error: { message: 'permission denied', code: '42501' } } // sem login: RLS recusa
  if (op === 'select') {
    if (a.table === 'historias') {
      let rows = [...historias.values()].filter((r) => r.owner === owner)
      if (a.eq) rows = rows.filter((r) => r[a.eq[0]] === a.eq[1])
      rows.sort((x, y) => (x.id < y.id ? -1 : 1))
      if (a.range) rows = rows.slice(a.range[0], a.range[1] + 1)
      return { data: structuredClone(rows) }
    }
    return { data: ajustes.has(owner) ? [structuredClone(ajustes.get(owner))] : [] }
  }
  if (op === 'upsert') {
    const row = { ...a.row, owner }
    ajustes.set(owner, row)
    pushChange('ajustes', owner, row)
    return { data: null }
  }
  if (op === 'rpc') {
    rpcCalls++
    const p = a.args
    const k = `${owner}|${p.p_id}`
    const cur = historias.get(k)
    if ((cur?.rev ?? 0) !== p.p_rev - 1) return { error: { message: 'conflito de revisão', code: 'P0409' } }
    const row = { owner, id: p.p_id, story: p.p_story, v: p.p_v, rev: p.p_rev, dev: p.p_dev, at: p.p_at, gone: p.p_gone }
    historias.set(k, row)
    pushChange('historias', owner, row)
    return { data: p.p_rev }
  }
  if (op === 'changes') return { data: changes.filter((c) => c.seq > a.since && c.owner === owner) }
  return { error: { message: 'operação desconhecida ' + op } }
}

/** Cliente imitando a parte do supabase-js que o app usa. */
function shim() {
  const KEY = '__fake_sb_session'
  let session = null
  try {
    session = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {}
  const listeners = new Set()
  const call = async (op, a = {}) => {
    // sem sessão, o banco do acervo aberto trata o visitante como a conta do acervo
    const r = await window.__sb(op, { ...a, owner: session?.user?.id || window.__acervoAberto || null })
    await new Promise((res) => setTimeout(res, 30)) // um pouco de rede
    return r
  }
  const setSession = (s) => {
    session = s
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
    listeners.forEach((l) => l(s ? 'SIGNED_IN' : 'SIGNED_OUT', s))
  }
  const query = (table) => {
    const q = { table, eq: null, range: null, single: false }
    const run = async () => {
      const r = await call('select', q)
      if (r.error) return { data: null, error: r.error }
      return { data: q.single ? r.data[0] ?? null : r.data, error: null }
    }
    const b = {
      select: () => b,
      order: () => b,
      eq: (c, v) => ((q.eq = [c, v]), b),
      range: (x, y) => ((q.range = [x, y]), b),
      maybeSingle: () => ((q.single = true), b),
      upsert: (row) => ({ then: (res, rej) => call('upsert', { table, row }).then((r) => ({ data: null, error: r.error || null })).then(res, rej) }),
      then: (res, rej) => run().then(res, rej),
    }
    return b
  }
  const channels = new Set()
  let since = 0
  setInterval(async () => {
    if ((!session && !window.__acervoAberto) || !channels.size) return
    const r = await call('changes', { since })
    if (r.error || !r.data) return
    for (const c of r.data) {
      since = Math.max(since, c.seq)
      channels.forEach((ch) => ch.table === c.table && ch.cb({ eventType: 'UPDATE', new: c.row }))
    }
  }, 300)
  window.__supabaseFake = {
    from: query,
    rpc: async (fn, args) => {
      const r = await call('rpc', { fn, args })
      return { data: r.data ?? null, error: r.error || null }
    },
    channel: () => {
      const ch = { table: '', cb: () => {} }
      const api = {
        on: (_t, f, cb) => ((ch.table = f.table), (ch.cb = cb), api),
        subscribe: (cb) => {
          channels.add(ch)
          setTimeout(() => cb('SUBSCRIBED'), 50)
          return api
        },
        __ch: ch,
      }
      return api
    },
    removeChannel: async (api) => channels.delete(api.__ch),
    auth: {
      onAuthStateChange: (cb) => {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      getSession: async () => ({ data: { session } }),
      signInWithOtp: async ({ email }) => ({ error: (await call('otp', { email })).error || null }),
      verifyOtp: async ({ email, token }) => {
        const r = await call('verify', { email, token })
        if (r.error) return { error: r.error }
        setSession(r.session)
        return { error: null }
      },
      signInWithPassword: async ({ email, password }) => {
        const r = await call('password', { email, password })
        if (r.error) return { error: r.error }
        setSession(r.session)
        return { error: null }
      },
      signOut: async () => (setSession(null), { error: null }),
    },
  }
}

async function device(name, vp, { seed = [], email = null, mobile = false, owner = null, aberto = null } = {}) {
  const ctx = await b.newContext({ viewport: vp, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) })
  if (owner || aberto) await ctx.addInitScript(([o, k]) => Object.assign(window, { __acervoEmail: o, __acervoAberto: k }), [owner, aberto])
  await ctx.exposeFunction('__sb', (op, a) => serve(name, op, a))
  await ctx.addInitScript(shim)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && !/Failed to fetch|net::ERR/.test(m.text()) && errors.push(`${name}: ${m.text()}`))
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
  const d = { p, ctx, name }
  if (email) await login(d, email)
  return d
}

async function login(d, email) {
  await d.p.click('.cloud')
  await d.p.fill('.cloud-account input[type=email]', email)
  await d.p.click('.cloud-account button:has-text("enviar link")')
  await d.p.fill('.cloud-account input[aria-label="Código do e-mail"]', CODE)
  await d.p.click('.cloud-account button:has-text("entrar")')
  await d.p.waitForSelector('.cloud-account :text("Conectado como")')
  await d.p.click('.settings button:has-text("fechar")')
}

const local = (d) =>
  d.p.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('arquivo-das-sombras')
    q.onsuccess = () => { const r = q.result.transaction('stories').objectStore('stories').getAll(); r.onsuccess = () => { q.result.close(); res(r.result) } }
  }))
const badge = (d) => d.p.textContent('.cloud')
const waitBadge = (d, re, timeout = 30000) => d.p.waitForFunction((s) => new RegExp(s).test(document.querySelector('.cloud')?.textContent || ''), re.source, { timeout, polling: 200 })
const waitLocal = async (d, pred, what) => {
  for (let i = 0; i < 100; i++) {
    if (pred(await local(d))) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  check(false, what)
  return false
}
const rowsOf = (email) => [...historias.values()].filter((r) => r.owner === userId(email))

async function write(d, title, text) {
  await d.p.click('.topbar button:has-text("Escrever")')
  await d.p.fill('.editor .e-title', title)
  await d.p.fill('.editor .e-text', text)
  await d.p.waitForSelector('[data-testid=save-status]:has-text("guardado")')
}
const closeEditor = (d) => d.p.click('.editor button:has-text("deixar na mesa")')

const EMAIL = 'caic@exemplo.com'
const old = { id: 'antiga1', t: 'A história que já existia', sub: 'sub — com travessão', x: 'Escrita antes da nuvem.\n\nSegundo parágrafo, “aspas” e acentuação: ação, coração.', tags: ['sombra'], st: 'f', note: 'nota', fav: true, del: false, c: 11, u: 22, o: 3, v: [{ t: 'A história', x: 'versão anterior', u: 5 }] }
const old2 = { id: 'antiga2', t: 'Rascunho antigo', sub: '', x: 'meio escrito', tags: [], st: 'd', note: '', fav: false, del: false, c: 12, u: 23, o: 4 }

// D. migração: computador com acervo antigo, antes de entrar: nada sobe, nada se perde
const pc = await device('pc', { width: 1280, height: 800 }, { seed: [old, old2] })
check(/entrar para salvar na nuvem/.test(await badge(pc)), 'sem login o aviso convida a entrar: ' + (await badge(pc)))
check(historias.size === 0, 'sem login nada vai para a nuvem')
await login(pc, EMAIL)
await waitBadge(pc, /salvo na nuvem/)
const up = rowsOf(EMAIL).find((r) => r.id === 'antiga1')
check(
  !!up && JSON.stringify({ ...up.story }) === JSON.stringify((({ v, ...s }) => s)(old)) && JSON.stringify(up.v) === JSON.stringify(old.v),
  'D: história antiga subiu idêntica (título, subtítulo, texto, etiquetas, ordem, datas, versões)',
)
check(rowsOf(EMAIL).length === 2, 'D: as duas histórias antigas estão na nuvem')
check((await local(pc)).length === 2, 'D: a cópia local continua no computador')
// recarregar e repetir a migração não duplica
await pc.p.reload()
await pc.p.waitForSelector('.cloud', { timeout: 120000 })
await waitBadge(pc, /salvo na nuvem/)
check(rowsOf(EMAIL).length === 2 && rowsOf(EMAIL).every((r) => r.rev === 1), 'D: recarregar não duplica nem regrava (revisão 1)')
await pc.p.screenshot({ path: `${out}/pc-1-migrado.png` })

// A. persistência: escrever, recarregar, o texto continua e é o da nuvem
await write(pc, 'Escrita no computador', 'Primeira linha escrita no computador.')
await pc.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
check(true, 'A: o editor diz "salvo na nuvem" depois da confirmação')
await closeEditor(pc)
const novo = rowsOf(EMAIL).find((r) => r.story?.t === 'Escrita no computador')
check(!!novo && novo.story.x === 'Primeira linha escrita no computador.', 'A: o texto novo está na nuvem')
await pc.p.reload()
await pc.p.waitForSelector('.cloud', { timeout: 120000 })
await waitBadge(pc, /salvo na nuvem/)
check((await local(pc)).some((s) => s.id === novo.id && s.x === novo.story.x), 'A: depois de recarregar, o texto continua e confere com a nuvem')

// C. sessão independente sem nada no navegador: entrar e receber tudo
const cel = await device('cel', { width: 390, height: 844 }, { mobile: true })
check((await local(cel)).length === 0, 'C: celular começa vazio')
await login(cel, EMAIL)
await waitLocal(cel, (l) => l.length === 3 && l.some((s) => s.id === 'antiga1' && s.x === old.x && s.v?.length === 1), 'C/B: celular recebeu as três histórias')
check(true, 'C/B: celular (tela pequena, toque) entrou e recebeu as três histórias, sem digitar nada')
await cel.p.screenshot({ path: `${out}/cel-1-recebido.png` })

// B. editar no celular chega ao computador (aberto, sem recarregar)
await cel.p.click('.topbar button:has-text("Acervo")')
await cel.p.click(`.library li:has-text("Escrita no computador") button:has-text("editar")`).catch(async () => {
  // o acervo pode abrir a história pelo título
  await cel.p.click(`.library :text("Escrita no computador")`)
})
await cel.p.waitForSelector('.editor .e-text')
await cel.p.fill('.editor .e-text', 'Editada no celular.')
await cel.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
await closeEditor(cel)
await waitLocal(pc, (l) => l.some((s) => s.id === novo.id && s.x === 'Editada no celular.'), 'B: edição do celular chegou ao computador')
check(true, 'B: edição feita no celular apareceu no computador aberto')

// E. falha de conexão: aviso, pendência guardada, retomada
offline.add('pc')
await write(pc, 'Sem internet', 'Escrito sem conexão.')
await waitBadge(pc, /erro ao salvar na nuvem|pendentes/)
const msg = await badge(pc)
check(/erro ao salvar na nuvem/.test(msg), 'E: o aviso informa o erro: ' + msg)
check(!(await pc.p.textContent('[data-testid=cloud-status]').catch(() => '')).includes('salvo na nuvem'), 'E: o editor não diz "salvo na nuvem" sem confirmação')
await closeEditor(pc)
check(!rowsOf(EMAIL).some((r) => r.story?.t === 'Sem internet'), 'E: nada chegou à nuvem durante a falha')
await pc.p.reload()
await pc.p.waitForSelector('.cloud', { timeout: 120000 })
check((await local(pc)).some((s) => s.t === 'Sem internet'), 'E: depois de recarregar sem conexão, o texto continua guardado no aparelho')
offline.delete('pc')
await pc.p.evaluate(() => dispatchEvent(new Event('online')))
await waitBadge(pc, /salvo na nuvem/, 90000)
check(rowsOf(EMAIL).filter((r) => r.story?.t === 'Sem internet').length === 1, 'E: a conexão voltou e a mudança subiu, uma vez só')
await waitLocal(cel, (l) => l.some((s) => s.t === 'Sem internet'), 'E: e chegou ao celular')
await pc.p.screenshot({ path: `${out}/pc-2-retomado.png` })

// F. concorrência: a mesma história editada nos dois aparelhos ao mesmo tempo
offline.add('cel')
const alvo = (await local(pc)).find((s) => s.id === 'antiga2')
await cel.p.click('.topbar button:has-text("Acervo")')
await cel.p.click(`.library li:has-text("Rascunho antigo") button:has-text("editar")`).catch(() => cel.p.click(`.library :text("Rascunho antigo")`))
await cel.p.fill('.editor .e-text', 'versão do celular')
await cel.p.waitForSelector('[data-testid=save-status]:has-text("guardado")')
await closeEditor(cel)
await pc.p.click('.topbar button:has-text("Acervo")')
await pc.p.click(`.library li:has-text("Rascunho antigo") button:has-text("editar")`).catch(() => pc.p.click(`.library :text("Rascunho antigo")`))
await pc.p.fill('.editor .e-text', 'versão do computador')
await pc.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
await closeEditor(pc)
offline.delete('cel')
await cel.p.evaluate(() => dispatchEvent(new Event('online')))
await waitBadge(cel, /salvo na nuvem/, 90000)
await waitLocal(pc, (l) => l.some((s) => s.x === 'versão do celular') && l.some((s) => s.x === 'versão do computador'), 'F: as duas versões existem no computador')
const textos = rowsOf(EMAIL).filter((r) => !r.gone).map((r) => r.story.x)
check(textos.includes('versão do celular') && textos.includes('versão do computador'), 'F: edição simultânea: nenhuma das duas versões se perdeu na nuvem')
check(rowsOf(EMAIL).some((r) => /cópia em conflito/.test(r.story?.t || '')), 'F: a versão que chegou depois virou "(cópia em conflito)"')
check(/cópia em conflito/.test(await badge(cel)), 'F: o aviso do celular conta a cópia em conflito: ' + (await badge(cel)))
check(alvo && rowsOf(EMAIL).find((r) => r.id === 'antiga2').story.x === 'versão do computador', 'F: a história original ficou com a versão gravada primeiro')

// F. editor aberto num aparelho enquanto o outro muda a mesma história
await pc.p.click('.topbar button:has-text("Acervo")')
await pc.p.click(`.library li:has-text("A história que já existia") button:has-text("editar")`)
await pc.p.waitForSelector('.editor .e-text')
await cel.p.click('.topbar button:has-text("Acervo")')
await cel.p.click(`.library li:has-text("A história que já existia") button:has-text("editar")`)
await cel.p.fill('.editor .e-text', 'Mudada no celular com o editor do computador aberto.')
await cel.p.waitForSelector('[data-testid=cloud-status]:has-text("salvo na nuvem")', { timeout: 30000 })
await closeEditor(cel)
await pc.p.waitForFunction(() => document.querySelector('.editor .e-text')?.value === 'Mudada no celular com o editor do computador aberto.', undefined, { timeout: 30000 })
check(true, 'F: editor aberto sem edição pendente mostra a versão nova do outro aparelho')
// agora o computador digita e, antes de gravar, chega outra mudança do celular
await pc.p.fill('.editor .e-text', 'Digitando no computador…')
await cel.p.click('.topbar button:has-text("Acervo")')
await cel.p.click(`.library li:has-text("A história que já existia") button:has-text("editar")`)
await cel.p.fill('.editor .e-text', 'Segunda mudança do celular.')
// gravada aqui; a versão do computador pode chegar logo depois e aparecer no editor
await cel.p.waitForFunction(() => /guardado|outro aparelho/.test(document.querySelector('[data-testid=save-status]')?.textContent || ''))
await closeEditor(cel)
await waitBadge(cel, /salvo na nuvem/, 60000)
await pc.p.waitForTimeout(2000)
await closeEditor(pc)
await waitBadge(pc, /salvo na nuvem/, 60000)
await waitBadge(cel, /salvo na nuvem/, 60000)
const t2 = rowsOf(EMAIL).filter((r) => !r.gone).map((r) => r.story.x)
check(t2.includes('Segunda mudança do celular.') && t2.includes('Digitando no computador…'), 'F: digitando enquanto chega mudança de outro aparelho: as duas versões ficam')

// F. outra conta não vê nada da primeira
const outro = await device('outro', { width: 1000, height: 700 }, { email: 'outra-pessoa@exemplo.com' })
await waitBadge(outro, /salvo na nuvem/)
await new Promise((r) => setTimeout(r, 1500))
check((await local(outro)).length === 0, 'F: outra conta entra e não recebe nenhuma história da primeira')
check(rowsOf('outra-pessoa@exemplo.com').length === 0 && rowsOf(EMAIL).length >= 5, 'F: a nuvem da primeira conta continua intacta')

// acervo de uma pessoa só: senha do acervo, sem e-mail
const sen = await device('senha', { width: 390, height: 844 }, { owner: EMAIL, mobile: true })
await waitBadge(sen, /entrar para salvar/)
await sen.p.click('.cloud')
check(!(await sen.p.$('.cloud-account input[type=email]')), 'senha do acervo: sem campo de e-mail')
await sen.p.fill('.cloud-account input[aria-label="Senha do acervo"]', 'senha-errada')
await sen.p.click('.cloud-account button:has-text("entrar")')
await sen.p.waitForSelector('.cloud-account :text("senha errada")')
check(true, 'senha do acervo: senha errada é recusada')
await sen.p.fill('.cloud-account input[aria-label="Senha do acervo"]', SENHA)
await sen.p.click('.cloud-account button:has-text("entrar")')
await sen.p.waitForSelector('.cloud-account :text("Conectado ao seu acervo")')
await sen.p.click('.settings button:has-text("fechar")')
await waitLocal(sen, (l) => l.some((s) => s.x === 'versão do computador'), 'senha do acervo: o aparelho recebe o acervo da conta')
await sen.p.reload()
await waitBadge(sen, /salvo na nuvem/)
check(true, 'senha do acervo: depois de recarregar continua conectado, sem digitar de novo')

// acervo aberto: sem login nenhum, dois aparelhos com o mesmo acervo
const ab1 = await device('aberto-pc', { width: 1000, height: 700 }, { aberto: userId(EMAIL), seed: [{ ...old2, id: 'so-no-pc', t: 'Só no computador aberto', x: 'texto antigo do pc aberto', o: 9 }] })
await waitBadge(ab1, /salvo na nuvem/)
check(!/entrar/.test(await badge(ab1)), 'acervo aberto: abre sem pedir login: ' + (await badge(ab1)))
await waitLocal(ab1, (l) => l.some((s) => s.x === 'versão do computador'), 'acervo aberto: o computador recebe o acervo sem login')
check(rowsOf(EMAIL).some((r) => r.id === 'so-no-pc'), 'acervo aberto: história antiga do aparelho subiu para a nuvem')
const ab2 = await device('aberto-cel', { width: 390, height: 844 }, { aberto: userId(EMAIL), mobile: true })
await waitBadge(ab2, /salvo na nuvem/)
await waitLocal(ab2, (l) => l.some((s) => s.id === 'so-no-pc'), 'acervo aberto: o celular recebe a história do computador')
await write(ab2, 'Escrita no celular aberto', 'Do celular sem login.')
await waitBadge(ab2, /salvo na nuvem/)
await waitLocal(ab1, (l) => l.some((s) => s.t === 'Escrita no celular aberto'), 'acervo aberto: o computador recebe a do celular')
check(true, 'acervo aberto: dois aparelhos sem login, mesmo acervo nos dois sentidos')
await ab1.p.click('.topbar button:has-text("Ajustes")')
check(!(await ab1.p.$('.cloud-account input')) && !(await ab1.p.$('.cloud-account button:has-text("sair")')), 'acervo aberto: Ajustes sem e-mail, senha nem "sair"')
await ab1.p.click('.settings button:has-text("fechar")')

// sair da conta: o app volta a "entrar para salvar", o aparelho mantém a cópia
await cel.p.click('.topbar button:has-text("Ajustes")')
await cel.p.click('.cloud-account button:has-text("sair da conta")')
await cel.p.click('.settings button:has-text("fechar")')
await waitBadge(cel, /entrar para salvar/)
check(true, 'sair da conta: o aviso volta a "entrar para salvar na nuvem"')
await cel.p.screenshot({ path: `${out}/cel-2-saiu.png` })

check(!errors.length, 'sem erros no console' + (errors.length ? ': ' + errors.join(' | ') : ''))
await b.close()
console.log(failures ? `${failures} FALHA(S)` : 'tudo certo')
process.exit(failures ? 1 : 0)
