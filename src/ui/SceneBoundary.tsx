import { Component, type ReactNode } from 'react'

/** Segura um erro do quarto 3D para que o resto do app (acervo, escrita, ajustes) continue de pé. */
export class SceneBoundary extends Component<{ onFail: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    this.props.onFail(error.message)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** O navegador consegue desenhar 3D? (sem isso o quarto nem é carregado) */
export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
