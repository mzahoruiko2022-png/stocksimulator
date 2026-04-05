/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set, `fetch` uses this origin for `/api/yahoo/...` (custom proxy backend). */
  readonly VITE_YAHOO_API_BASE?: string;
}
