import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // caminhos relativos: a pasta dist/ funciona em qualquer endereço
  base: './',
  plugins: [react()],
  build: {
    // O pedaço da cena 3D tem ~1,25 MB (375 KB comprimido): three.js, R3F, drei e pós-processamento,
    // e já é carregado à parte, depois dos dados. O aviso padrão de 500 KB não se aplica a ele.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
