# First-party site analytics

This app can record **page views and sessions** in Postgres (tables `analytics_sessions` and `analytics_page_views`), independent of Google Analytics. Events are sent only after the visitor accepts **analytics** cookies (same rule as Consent Mode in `client/src/lib/analytics.ts`).

## Operator UI (custom subdomain)

**Do this first (stops the “still the home page” problem):** on the Render **Web Service**, add a **build-time** variable (same place as other `VITE_*` vars), then **Clear build cache & deploy**:

- **`VITE_SITE_APEX=chessgm.co`** — your apex only (no `https://`, no `www.`).
- Optional: **`VITE_OPERATOR_SUBDOMAIN_PREFIXES=goadmingo,admin`** — defaults to exactly that if omitted when `VITE_SITE_APEX` is set.

The client then treats **`goadmingo.chessgm.co`** and **`admin.chessgm.co`** as the operator shell **without** relying on HTML meta or Cloudflare caching. The bare apex and **`www.<apex>`** stay on the main app.

**Alternative:** set **`VITE_APP_PUBLIC_ORIGIN=https://chessgm.co`** (mirror of `APP_PUBLIC_ORIGIN`) instead of `VITE_SITE_APEX`; the apex is derived the same way.

Then:

1. Point DNS (e.g. `goadmingo`) as a **CNAME** to your Render service, same as the main site.
2. Open `https://goadmingo.chessgm.co/` — you should see the sidebar and redirect to site analytics.
3. Paste **`ADMIN_API_KEY`** in the UI to load data.

**Older / optional paths:** server meta `cfp-operator-hostnames` + `ADMIN_PORTAL_HOSTNAMES`, or `hostname.startsWith("admin.")`, still work but are easy to misconfigure; **`VITE_SITE_APEX` is the reliable fix.**

For first-party **collect** from those hosts, **`ADMIN_PORTAL_HOSTNAMES`** is automatically merged into the collect allowlist. You can still add **`APP_ANALYTICS_ALLOWED_HOSTS`** for other staging hosts.

The collect API also allows `APP_PUBLIC_ORIGIN`’s host plus `admin.<apex>` (apex = host with a leading `www.` stripped).

## Server configuration

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Required for storage; without it, collect returns **204** and admin APIs return **503**. |
| `APP_PUBLIC_ORIGIN` | e.g. `https://chessgm.co` — used for magic links and to allow analytics `Origin` / `Referer`. |
| `APP_ANALYTICS_ALLOWED_HOSTS` | Optional extra allowed hosts for `POST /api/analytics/collect`. |
| `ADMIN_API_KEY` | Bearer / `X-Admin-Key` for `GET /api/admin/analytics/*` and `PUT /api/admin/pricing`. |
| `ADMIN_PORTAL_HOSTNAMES` | Comma-separated hostnames (e.g. `goadmingo.chessgm.co`). Injected into HTML at **runtime** so the operator shell works **without** a Vite rebuild. Also allows analytics collect from those hosts. |
| `VITE_SITE_APEX` | **Recommended.** Apex host only (e.g. `chessgm.co`). Build-time; enables `goadmingo.*` / `admin.*` operator UI without meta injection. |
| `VITE_APP_PUBLIC_ORIGIN` | Optional mirror of public URL for same apex rule if `VITE_SITE_APEX` is unset. |
| `VITE_OPERATOR_SUBDOMAIN_PREFIXES` | Optional; defaults to `goadmingo,admin` when apex is set. |
| `ADMIN_ANALYTICS_RETENTION_DAYS` | Documented for future retention jobs; not enforced in-app yet. |

Behind Render (or any proxy), **`trust proxy`** is enabled so `req.ip` and `geoip-lite` see the client IP. If you use **Cloudflare**, country can come from **`CF-IPCountry`** without extra dependencies.

## Schema

Apply with your usual Drizzle flow (e.g. `npm run db:push` / Render build hook) so the analytics tables exist before relying on metrics.

Tables:

- `analytics_sessions` / `analytics_page_views` — consent-gated SPA page views
- `analytics_signups` — server-recorded sign-ups (email, magic link, Lichess); no cookie consent required

Admin APIs (operator session or `ADMIN_API_KEY`):

- `GET /api/admin/analytics/summary` — traffic KPIs + sign-up count
- `GET /api/admin/analytics/recent-signups` — sign-up log with method
- `GET /api/admin/analytics/top-pages` — all paths
- `GET /api/admin/analytics/top-trainer-pages` — /training, /coach, etc.
- `GET /api/admin/analytics/top-trainers` — puzzle attempts by module
- `GET /api/admin/analytics/health` — env + database checklist

GA4 custom events (after cookie consent): `sign_up`, `trainer_view`, `trainer_attempt`, `purchase`, `begin_checkout`.

## Retention

Row growth is unbounded until you add a cron job or manual SQL (e.g. delete page views older than *N* days). Set `ADMIN_ANALYTICS_RETENTION_DAYS` in `.env` as a reminder for ops; implementation of the job is left to your scheduler.

## Google Analytics

You can leave **`VITE_GA4_MEASUREMENT_ID`** unset and rely on first-party analytics only, or run both in parallel.

## Troubleshooting

### Content-Security-Policy / inline script blocked

If Cloudflare (or another layer) sends a **`Content-Security-Policy`** with `script-src 'self'`, it is **combined** with Helmet’s policy; the effective rule is the **stricter** intersection, so inline `gtag` hashes from the server can still be blocked.

This app loads the Consent Mode bootstrap from **`/gtag-consent-bootstrap.js`** (same origin) so **`script-src 'self'`** is enough. If you still see CSP errors, check Cloudflare **Transform Rules / Response headers** for a duplicate CSP and align or remove the stricter one.

**Still seeing `Refused to execute inline script` with hash `sha256-8sG4kd3…`?** That hash matches the **old** inline `gtag` block. Your browser or **Cloudflare is serving a cached `index.html`**. Purge cache in Cloudflare (**Caching → Configuration → Purge Everything** or purge `https://goadmingo.chessgm.co/`), then hard-refresh. Turn off **Rocket Loader** for this zone (it injects scripts and can trip CSP). The origin now sends **`Cache-Control: no-store`** on HTML to discourage edge caching of the shell document.

### `drizzle-kit push` error: `column "id" is in a primary key` (42P16)

Usually means Postgres could not apply Drizzle’s generated migration (often around **`analytics_*`** if an older partial definition exists). On Render, the build runs **`scripts/ensure-analytics-tables.mjs`** first (idempotent `CREATE IF NOT EXISTS`) so analytics tables exist even when push fails.

To reset only analytics tables (destructive — you lose stored analytics rows):

```sql
DROP TABLE IF EXISTS analytics_page_views CASCADE;
DROP TABLE IF EXISTS analytics_sessions CASCADE;
```

Redeploy so Drizzle can recreate them, or rely on the ensure script on the next build.

### Unblock deploy while fixing Drizzle

Set **`DRIZZLE_PUSH_LENIENT=1`** on the Render Web Service so a failing `drizzle-kit push` does **not** fail the build (use only until the DB drift is fixed).
