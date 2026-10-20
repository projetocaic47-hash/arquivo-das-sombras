import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import './ui/theme.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
