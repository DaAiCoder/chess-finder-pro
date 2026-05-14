/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. `chessgm.co` — enables client-side operator host detection for subdomains. */
  readonly VITE_SITE_APEX?: string;
  /** Mirror of public site URL for apex derivation, e.g. `https://chessgm.co` */
  readonly VITE_APP_PUBLIC_ORIGIN?: string;
  /** Comma-separated first labels, e.g. `goadmingo,admin` (default when apex set). */
  readonly VITE_OPERATOR_SUBDOMAIN_PREFIXES?: string;
  readonly VITE_ADMIN_PORTAL_HOSTNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
