import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const keyPath = process.env.WS_SSL_KEY ?? path.resolve('C:/certs/shadow-ws.key.pem')
const certPath = process.env.WS_SSL_CERT ?? path.resolve('C:/certs/shadow-ws.cert.pem')

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
  },
  plugins: [react()],
})