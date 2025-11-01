declare module 'vite-plugin-mkcert/dist/mkcert.mjs' {
  type Logger = {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
  }

  interface CertificatePayload {
    key?: string
    cert?: string
  }

  interface MkcertInstance {
    init(): Promise<void>
    install(hosts: string[]): Promise<CertificatePayload>
  }

  interface MkcertFactoryOptions {
    logger: Logger
    force?: boolean
    autoUpgrade?: boolean
    source?: unknown
    mkcertPath?: string
    savePath?: string
    keyFileName?: string
    certFileName?: string
  }

  export default class Mkcert {
    static create(options: MkcertFactoryOptions): MkcertInstance
  }
}
