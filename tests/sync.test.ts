import { describe, expect, it } from 'vitest'
import { newMeta, SyncEngine, toCloud, DOC_LIMIT, type CloudConfig, type CloudStory, type Local, type Remote } from '../src/data/sync'
import { DEFAULT_CONFIG, type Config, type Story } from '../src/data/types'

// Uma nuvem de mentira em memória, com o mesmo comportamento que o app usa: documentos,
// travas e avisos de mudança para todos os aparelhos ligados.
class FakeCloud {
  stories = new Map<string, CloudStory>()
  cfg: CloudConfig | null = null
  offline = false
  writes = 0
  /** como o Supabase: sem trava; a gravação confere a revisão (put_historia) */
  cas = false
  /** chamado depois de cada leitura de história (para simular outro aparelho no meio) */
  afterGet: (() => void) | null = null
  private watchers = new Set<(l: CloudStory[]) => void>()
  private cfgWatchers = new Set<(c: CloudConfig | null) => void>()
  remote(): Remote {
    const check = () => {
      if (this.offline) throw new Error('sem conexão')
    }
    return {
      lock: async () => {
        check()
        return true
      },
      getStory: async (id) => {
        check()
        const r = structuredClone(this.stories.get(id) ?? null)
        const f = this.afterGet
        this.afterGet = null
        f?.()
        return r
      },
      putStory: async (c) => {
        check()
        if (this.cas && (this.stories.get(c.id)?.rev ?? 0) !== c.rev - 1) throw Object.assign(new Error('conflito de revisão'), { code: 'conflict' })
        this.writes++
        this.stories.set(c.id, structuredClone(c))
        const list = [...this.stories.values()].map((x) => structuredClone(x))
        this.watchers.forEach((w) => queueMicrotask(() => w(list)))
      },
      watchStories: (next) => {
        this.watchers.add(next)
        queueMicrotask(() => next([...this.stories.values()].map((x) => structuredClone(x))))
        return () => this.watchers.delete(next)
      },
      putConfig: async (c) => {
        check()
        this.cfg = structuredClone(c)
        this.cfgWatchers.forEach((w) => queueMicrotask(() => w(structuredClone(c))))
      },
      watchConfig: (next) => {
        this.cfgWatchers.add(next)
        queueMicrotask(() => next(this.cfg && structuredClone(this.cfg)))
        return () => this.cfgWatchers.delete(next)
      },
    }
  }
}

// relógio único para todos os aparelhos do teste (no app real todos usam a hora do sistema)
let clock = 1000
/** Um aparelho: o acervo local dele e o motor de sincronização. */
function device(cloud: FakeCloud, dev: string, initial: Story[] = []) {
  let stories = initial.map((s) => ({ ...s }))
  let config: Config = { ...DEFAULT_CONFIG }
  const local: Local = {
    stories: () => stories,
    config: () => config,
    apply: async (put, removed) => {
      stories = stories.filter((s) => !removed.includes(s.id) && !put.some((p) => p.id === s.id)).concat(put)
    },
    applyConfig: async (c) => {
      config = c
    },
  }
  let n = 0
  const eng = new SyncEngine(cloud.remote(), local, newMeta(dev), () => {}, { now: () => ++clock, newId: () => `${dev}-copia-${++n}` })
  return {
    eng,
    get stories() {
      return stories
    },
    get config() {
      return config
    },
    /** como o app: grava local e avisa */
    async save(s: Story) {
      stories = stories.filter((x) => x.id !== s.id).concat({ ...s })
      await eng.changed([s.id])
    },
    async purge(id: string) {
      stories = stories.filter((x) => x.id !== id)
      await eng.purged([id])
    },
    async setConfig(p: Partial<Config>) {
      config = { ...config, ...p }
      await eng.configChanged()
    },
  }
}

const story = (id: string, x: string, extra: Partial<Story> = {}): Story => ({ id, t: 'Título ' + id, sub: '', x, tags: [], st: 'f', note: '', fav: false, del: false, c: 1, u: 1, o: 1, ...extra })
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('sincronização com a nuvem', () => {
  it('o que é escrito num aparelho aparece no outro', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    const cel = device(cloud, 'cel')
    pc.eng.start()
    cel.eng.start()
    await pc.save(story('a', 'Era uma vez'))
    await settle()
    expect(cel.stories.map((s) => s.x)).toEqual(['Era uma vez'])
    await cel.save({ ...cel.stories[0], x: 'Era uma vez, de novo' })
    await settle()
    expect(pc.stories[0].x).toBe('Era uma vez, de novo')
    expect(pc.eng.status().state).toBe('saved')
  })

  it('primeira vez: o acervo que já existia no aparelho sobe para a nuvem sem perder nada', async () => {
    const cloud = new FakeCloud()
    const old = device(cloud, 'pc', [story('a', 'um'), story('b', 'dois', { v: [{ t: 'b', x: 'antes', u: 1 }] })])
    old.eng.start()
    await settle()
    expect([...cloud.stories.keys()].sort()).toEqual(['a', 'b'])
    const cel = device(cloud, 'cel')
    cel.eng.start()
    await settle()
    expect(cel.stories.map((s) => s.x).sort()).toEqual(['dois', 'um'])
    expect(cel.stories.find((s) => s.id === 'b')!.v).toEqual([{ t: 'b', x: 'antes', u: 1 }])
  })

  it('edição ao mesmo tempo em dois aparelhos: nenhuma se perde', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    const cel = device(cloud, 'cel')
    pc.eng.start()
    cel.eng.start()
    await pc.save(story('a', 'original'))
    await settle()
    // o celular fica sem internet e edita; o computador edita a mesma história
    cloud.offline = true
    await cel.save({ ...cel.stories[0], x: 'versão do celular' })
    expect(cel.eng.status().state).toBe('pending')
    cloud.offline = false
    await pc.save({ ...pc.stories[0], x: 'versão do computador' })
    await settle()
    await cel.eng.online()
    await settle()
    const texts = (d: typeof pc) => d.stories.map((s) => `${s.t}: ${s.x}`).sort()
    expect(texts(cel)).toEqual(['Título a (cópia em conflito): versão do celular', 'Título a: versão do computador'])
    expect(texts(pc)).toEqual(texts(cel))
    expect(cel.eng.status().conflicts).toBe(1)
  })

  it('sem conexão: as mudanças esperam e sobem quando a conexão volta, sem duplicar', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    pc.eng.start()
    await settle()
    cloud.offline = true
    await pc.save(story('a', 'um'))
    await pc.save(story('a', 'um, corrigido'))
    expect(pc.eng.status()).toMatchObject({ state: 'pending', pending: 1 })
    expect(cloud.stories.size).toBe(0)
    cloud.offline = false
    await pc.eng.online()
    await settle()
    expect(cloud.stories.get('a')!.story!.x).toBe('um, corrigido')
    expect(cloud.stories.size).toBe(1)
    expect(pc.eng.status()).toMatchObject({ state: 'saved', pending: 0 })
  })

  it('excluir de vez some dos outros aparelhos', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    const cel = device(cloud, 'cel')
    pc.eng.start()
    cel.eng.start()
    await pc.save(story('a', 'um'))
    await pc.save(story('b', 'dois'))
    await settle()
    await pc.purge('a')
    await settle()
    expect(cel.stories.map((s) => s.id)).toEqual(['b'])
    expect(cloud.stories.get('a')!.gone).toBe(true)
  })

  it('mesma história diferente em dois aparelhos antes da primeira sincronização: as duas ficam', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc', [story('a', 'do computador')])
    pc.eng.start()
    await settle()
    const cel = device(cloud, 'cel', [story('a', 'do celular')])
    cel.eng.start()
    await settle()
    expect(cel.stories.map((s) => s.x).sort()).toEqual(['do celular', 'do computador'])
    await settle()
    expect(pc.stories.map((s) => s.x).sort()).toEqual(['do celular', 'do computador'])
  })

  it('ajustes: a mudança mais recente vale em todos os aparelhos, e os da nuvem não são apagados por um aparelho novo', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    pc.eng.start()
    await settle()
    await pc.setConfig({ n: 'MEU ARQUIVO', pos: { sid: 'a', off: 3 } })
    await settle()
    const cel = device(cloud, 'cel')
    cel.eng.start()
    await settle()
    expect(cel.config.n).toBe('MEU ARQUIVO')
    expect(cel.config.pos).toEqual({ sid: 'a', off: 3 })
    await cel.setConfig({ fs: 24 })
    await settle()
    expect(pc.config.fs).toBe(24)
  })

  it('história grande demais: as versões antigas saem; se nem assim couber, fica só no aparelho e avisa', async () => {
    const big = 'x'.repeat(60_000)
    const s = story('a', big, { v: [1, 2, 3, 4, 5].map((u) => ({ t: 'a', x: big, u })) })
    const c = toCloud(s, 1, 'pc', 1)!
    expect(c.v!.length).toBeLessThan(5)
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(DOC_LIMIT)
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc', [story('g', 'y'.repeat(DOC_LIMIT + 10))])
    pc.eng.start()
    await settle()
    expect(cloud.stories.has('g')).toBe(false)
    expect(pc.eng.status().tooBig).toEqual(['g'])
  })

  it('banco com revisão conferida na gravação: outro aparelho gravando no meio vira cópia, nada se perde', async () => {
    const cloud = new FakeCloud()
    cloud.cas = true
    const pc = device(cloud, 'pc')
    pc.eng.start()
    await pc.save(story('a', 'original'))
    await settle()
    // entre a leitura e a gravação do computador, o celular grava a revisão 2
    cloud.afterGet = () => cloud.stories.set('a', { ...cloud.stories.get('a')!, story: { ...cloud.stories.get('a')!.story!, x: 'do celular' }, rev: 2, dev: 'cel' })
    await pc.save({ ...pc.stories[0], x: 'do computador' })
    await settle()
    expect(cloud.stories.get('a')!.story!.x).toBe('do celular')
    const textos = pc.stories.map((s) => s.x).sort()
    expect(textos).toEqual(['do celular', 'do computador'])
    expect(pc.stories.find((s) => s.x === 'do computador')!.t).toMatch(/cópia em conflito/)
    expect(pc.eng.status()).toMatchObject({ state: 'saved', conflicts: 1, error: null })
  })

  it('falha ao enviar: o estado mostra o erro e as mudanças ficam pendentes até a nuvem voltar', async () => {
    const cloud = new FakeCloud()
    const pc = device(cloud, 'pc')
    pc.eng.start()
    await settle()
    cloud.offline = true
    await pc.save(story('a', 'sem internet'))
    expect(pc.eng.status()).toMatchObject({ state: 'pending', pending: 1, error: 'sem conexão' })
    cloud.offline = false
    await pc.eng.online()
    await settle()
    expect(pc.eng.status()).toMatchObject({ state: 'saved', pending: 0, error: null })
    expect(cloud.stories.get('a')!.story!.x).toBe('sem internet')
  })

  it('migração repetida (recarregar, outro aparelho com a mesma história) não duplica', async () => {
    const cloud = new FakeCloud()
    cloud.cas = true
    const a = device(cloud, 'pc', [story('h', 'mesmo texto')])
    a.eng.start()
    await settle()
    // outro navegador com a mesma história antiga, nunca sincronizado
    const b = device(cloud, 'cel', [story('h', 'mesmo texto')])
    b.eng.start()
    await settle()
    // e o primeiro "recarrega" do zero (memória da sincronização perdida)
    const a2 = device(cloud, 'pc2', [story('h', 'mesmo texto')])
    a2.eng.start()
    await settle()
    expect(cloud.stories.size).toBe(1)
    expect(b.stories.length).toBe(1)
    expect(a2.stories.length).toBe(1)
    expect(cloud.stories.get('h')!.rev).toBe(1)
  })

  it('resposta atrasada de uma leitura antiga não volta a história para trás', async () => {
    const cloud = new FakeCloud()
    cloud.cas = true
    const pc = device(cloud, 'pc')
    pc.eng.start()
    await pc.save(story('a', 'um'))
    await settle()
    const velha = structuredClone(cloud.stories.get('a')!)
    await pc.save({ ...pc.stories[0], x: 'dois' })
    await settle()
    // chega agora a lista lida antes da segunda gravação
    ;(pc.eng as unknown as { incoming(l: CloudStory[]): Promise<void> }).incoming([velha])
    await settle()
    expect(pc.stories[0].x).toBe('dois')
    await pc.save({ ...pc.stories[0], x: 'três' })
    await settle()
    expect(pc.eng.status()).toMatchObject({ state: 'saved', conflicts: 0 })
    expect(cloud.stories.get('a')!.story!.x).toBe('três')
  })
})

