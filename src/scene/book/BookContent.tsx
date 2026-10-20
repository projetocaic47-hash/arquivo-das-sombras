import { useEffect } from 'react'
import { book } from '../../book/controller'
import { buildPages } from '../../book/pages'
import type { Config, Story } from '../../data/types'
import { atmosphere } from '../atmosphere'
import { loadPageFonts, pageMetrics, pageStyle } from './pageArt'

/** Pagina as histórias do acervo para o livro sempre que elas ou o tamanho da letra mudam. */
export function BookContent({ stories, config }: { stories: Story[]; config: Config }) {
  useEffect(() => {
    let alive = true
    loadPageFonts().then(() => {
      if (alive) book.setPages(buildPages(stories, pageMetrics(pageStyle(config))))
    })
    return () => {
      alive = false
    }
  }, [stories, config.fs]) // eslint-disable-line react-hooks/exhaustive-deps
  // "reduzir animações" do original ou do sistema: páginas trocam sem virar
  useEffect(() => {
    book.reducedMotion = !!config.rm || atmosphere.reducedMotion
  }, [config.rm])
  return null
}
