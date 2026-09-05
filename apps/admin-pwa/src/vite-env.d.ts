/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Optional absolute API base URL; derived from window.location when unset. */
  readonly VITE_API_URL?: string;
  /** API port used when deriving the base URL. Defaults to 3000. */
  readonly VITE_API_PORT?: string;
  readonly VITE_APP_ENV: string;
  readonly VITE_AUTH_BYPASS: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
