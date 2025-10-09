/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_PROVIDER?: string;
  readonly VITE_DEFAULT_MODEL?: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_CDP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
