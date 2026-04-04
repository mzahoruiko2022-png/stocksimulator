/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set, `fetch` calls this origin for `/yahoo/...` (production proxy). */
  readonly VITE_YAHOO_API_BASE?: string;
}
