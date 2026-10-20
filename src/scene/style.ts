/**
 * Estilo gráfico do quarto. 'pixel' (padrão desde a escolha do diretor criativo):
 * a mesma cena 3D desenhada em baixa resolução, com paleta limitada e pontilhado.
 * 'realista' continua disponível com ?estilo=realista, para comparação.
 */
export type SceneStyle = 'pixel' | 'realista'

export const STYLE: SceneStyle =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('estilo') === 'realista' ? 'realista' : 'pixel'

/**
 * Tamanho de cada pixel da arte, em pixels da tela: cerca de 560 pixels de arte
 * na média geométrica de largura e altura (1440x900 vira 720x450), nunca menos de 2,
 * fino o bastante para o texto das páginas ser lido sem perder o aspecto de pixel.
 */
export function pixelSize(width: number, height: number) {
  return Math.min(5, Math.max(2, Math.round(Math.sqrt(width * height) / 560)))
}
