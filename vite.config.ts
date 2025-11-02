import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const resolveHttpsConfig = () => {
  const keyPath = process.env.WS_SSL_KEY
  const certPath = process.env.WS_SSL_CERT

  if (!keyPath || !certPath) {
    return undefined
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.warn('[shadow-play] HTTPS disabled: missing WS_SSL_KEY/WS_SSL_CERT files')
    return undefined
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
}

const httpsConfig = resolveHttpsConfig()

export default defineConfig({
  server: {
    host: '0.0.0.0',
    https: httpsConfig,
  },
  plugins: [react()],
})