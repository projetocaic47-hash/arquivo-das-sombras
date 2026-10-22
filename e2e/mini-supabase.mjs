// "Mini-Supabase" para testes: um servidor HTTP local que responde como o Supabase às
// chamadas que o app faz (login por código de e-mail, PostgREST e a função put_historia),
// executando tudo num PostgreSQL de verdade com a migração do projeto e o RLS ativo.
// Assim o cliente oficial (@supabase/supabase-js) e as regras do banco são testados juntos.
// O tempo real (websocket) não é imitado: o app relê a nuvem ao voltar para a página, ao
// reconectar e a cada minuto, e é isso que os testes usam aqui.
// Uso: import { startMiniSupabase } from './mini-supabase.mjs'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pg = require('pg')

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const uidOf = (email) => {
  const h = createHash('md5').update(email).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Cria um banco temporário com a migração e sobe o servidor. */
export async function startMiniSupabase({ port = 54321, code = '123456' } = {}) {
  const db = `arquivo_e2e_${process.pid}`
  const asPg = (args) => execFileSync(process.getuid?.() === 0 ? 'runuser' : 'psql', process.getuid?.() === 0 ? ['-u', 'postgres', '--', 'psql', ...args] : args, { stdio: 'pipe', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } })
  asPg(['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${db}`])
  asPg(['-X', '-q', '-d', 'postgres', '-c', `create database ${db}`])
  for (const f of ['supabase/tests/stub-supabase.sql', 'supabase/migrations/20261022000000_arquivo_nuvem.sql']) asPg(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f])
  // o servidor conecta como postgres (senha só deste PostgreSQL de teste) e troca para o
  // papel de quem chama, como o PostgREST
  const password = process.env.MINI_SB_PG_PASSWORD || 'arquivo-teste-local'
  asPg(['-X', '-q', '-d', 'postgres', '-c', `alter role postgres password '${password}'`])
  const pool = new pg.Pool({ database: db, user: 'postgres', host: '127.0.0.1', password })
  const offline = new Set()
  const log = []

  /** Roda no papel e com o login de quem chamou (o RLS decide o que pode). */
  async function asUser(sub, fn) {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub || ''])
      const r = await fn(c)
      await c.query('commit')
      return r
    } catch (e) {
      await c.query('rollback').catch(() => {})
      throw e
    } finally {
      c.release()
    }
  }

  const session = (user) => {
    const now = Math.floor(Date.now() / 1000)
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.x`
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r.' + user.id + '.' + user.email, user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() } }
  }
  const subOf = (req) => {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '').split('.')
    try {
      return JSON.parse(Buffer.from(t[1], 'base64url').toString()).sub || null
    } catch {
      return null
    }
  }
  const pgError = (e) => ({ code: e.code, message: e.message, details: null, hint: null })
  const COLS = new Set(['owner', 'id', 'story', 'v', 'rev', 'dev', 'at', 'gone', 'cfg', 'updated_at'])

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const body = await new Promise((r) => {
      let d = ''
      req.on('data', (c) => (d += c))
      req.on('end', () => r(d))
    })
    const send = (status, obj, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', ...headers })
      res.end(obj === undefined ? '' : JSON.stringify(obj))
    }
    if (req.method === 'OPTIONS') return send(204)
    const client = req.headers['x-teste-aparelho'] || 'sem-nome'
    log.push(`${req.method} ${url.pathname}${url.search}`)
    // aparelho "sem internet": a conexão cai
    if ([...offline].some((o) => (req.headers.origin || '').includes(o) || client === o)) return req.socket.destroy()
    try {
      const p = url.pathname
      if (p === '/auth/v1/otp') return send(200, {})
      if (p === '/auth/v1/verify') {
        const b = JSON.parse(body || '{}')
        if (b.token !== code) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
        const user = { id: uidOf(b.email), email: b.email }
        await pool.query('insert into auth.users (id) values ($1) on conflict do nothing', [user.id])
        return send(200, session(user))
      }
      if (p === '/auth/v1/token') {
        const b = JSON.parse(body || '{}')
        const [, id, email] = String(b.refresh_token || '').split('.')
        return id ? send(200, session({ id, email: email || '' })) : send(400, { error: 'invalid_grant' })
      }
      if (p === '/auth/v1/user') {
        const sub = subOf(req)
        return sub ? send(200, session({ id: sub, email: '' }).user) : send(401, { msg: 'no user' })
      }
      if (p === '/auth/v1/logout') return send(204)
      if (p.startsWith('/realtime/')) return send(404, {})
      const sub = subOf(req)
      if (p === '/rest/v1/rpc/put_historia') {
        const a = JSON.parse(body)
        log.push(`  put ${a.p_id} rev ${a.p_rev} dev ${a.p_dev} x=${String(a.p_story?.x).slice(0, 30)}`)
        const r = await asUser(sub, (c) => c.query('select public.put_historia($1,$2,$3,$4,$5,$6,$7) as r', [a.p_id, JSON.stringify(a.p_story), a.p_v == null ? null : JSON.stringify(a.p_v), a.p_rev, a.p_dev, a.p_at, a.p_gone]))
        return send(200, r.rows[0].r)
      }
      const m = /^\/rest\/v1\/(historias|ajustes)$/.exec(p)
      if (!m) return send(404, { message: 'rota desconhecida ' + p })
      const table = m[1]
      if (req.method === 'GET') {
        const cols = (url.searchParams.get('select') || '*').split(',').filter((c) => c === '*' || COLS.has(c))
        const where = []
        const args = []
        for (const [k, v] of url.searchParams) {
          if (!COLS.has(k)) continue
          const mm = /^eq\.(.*)$/.exec(v)
          if (!mm) continue
          args.push(mm[1])
          where.push(`${k} = $${args.length}`)
        }
        let sql = `select ${cols.join(',')} from public.${table}${where.length ? ' where ' + where.join(' and ') : ''}`
        const ord = url.searchParams.get('order')
        if (ord && COLS.has(ord.split('.')[0])) sql += ` order by ${ord.split('.')[0]} ${ord.endsWith('.desc') ? 'desc' : 'asc'}`
        const lim = url.searchParams.get('limit')
        const off = url.searchParams.get('offset')
        if (lim) sql += ` limit ${+lim}`
        if (off) sql += ` offset ${+off}`
        const r = await asUser(sub, (c) => c.query(sql, args))
        if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
          if (r.rows.length !== 1) return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.rows.length} rows` })
          return send(200, r.rows[0])
        }
        return send(200, r.rows)
      }
      if (req.method === 'POST' && table === 'ajustes') {
        const rows = [].concat(JSON.parse(body))
        await asUser(sub, async (c) => {
          for (const row of rows)
            await c.query('insert into public.ajustes (owner, cfg, at, dev) values ($1,$2,$3,$4) on conflict (owner) do update set cfg = excluded.cfg, at = excluded.at, dev = excluded.dev, updated_at = now()', [row.owner, JSON.stringify(row.cfg), row.at, row.dev])
        })
        return send(201, undefined)
      }
      return send(405, { message: 'não suportado' })
    } catch (e) {
      return send(e.code === '42501' ? 401 : 400, pgError(e))
    }
  })
  await new Promise((r) => server.listen(port, r))
  return {
    url: `http://localhost:${port}`,
    pool,
    offline,
    log,
    uidOf,
    async rows(email) {
      const r = await pool.query('select * from public.historias where owner = $1 order by id', [uidOf(email)])
      return r.rows
    },
    async close() {
      await new Promise((r) => server.close(r))
      server.closeAllConnections?.()
      await pool.end()
      asPg(['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${db}`])
    },
  }
}
