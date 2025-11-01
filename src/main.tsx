import { StrictMode, version as reactVersion } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

if (typeof window !== 'undefined') {
  const hook = (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { inject?: (renderer: { version?: string }) => void } }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook && typeof hook.inject === 'function') {
    const originalInject = hook.inject
    hook.inject = (renderer) => {
      if (!renderer.version) {
        renderer.version = reactVersion ?? '0.0.0'
      }
      return originalInject(renderer)
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
