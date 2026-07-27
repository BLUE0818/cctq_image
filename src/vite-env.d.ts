/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __DEV_PROXY_CONFIG__: unknown

interface ImportMetaEnv {
  readonly VITE_API_PROXY_AVAILABLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
