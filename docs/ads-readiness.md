# Ads-Readiness Checklist

Step-by-step setup so a Google Ads campaign for Chess Finder Pro can (a)
get approved, (b) actually charge customers, and (c) measure paid
conversions. Follow top-to-bottom; nothing in here requires code changes —
this is the manual configuration work that pairs with the code shipped in
the "Ads-Ready Foundation" plan.

---

## 1. Stripe — subscriptions and customer portal

### 1.1 Create products and prices

1. Sign up / log in at <https://dashboard.stripe.com>.
2. Toggle to **Test mode** in the upper-right while you wire things up.
3. **Products → Add product.** Create:
   - **Chess Finder Pro — Monthly**
     - Pricing: Recurring, `USD 12.99`, billed monthly.
     - Save. Copy the resulting `price_…` ID into `.env` as
       `STRIPE_PRICE_MONTHLY_ID`.
   - **Chess Finder Pro — Yearly**
     - Pricing: Recurring, `USD 79.00`, billed yearly.
     - Save. Copy the `price_…` ID into `.env` as
       `STRIPE_PRICE_YEARLY_ID`.

> The default $12.99 / $79 numbers live in `data/site-pricing.json` and can be
> tweaked from the admin UI at `/admin/pricing` (uses `ADMIN_API_KEY`). If
> you change them here, you must also create new Stripe Prices and update
> the env vars above — Stripe Prices are immutable.

### 1.2 API keys

1. **Developers → API keys → Reveal test key.** Copy the secret (`sk_test_…`).
2. Paste into `.env` as `STRIPE_SECRET_KEY`.
3. When you're ready to flip to live mode, repeat with the `sk_live_…` key.

### 1.3 Webhook endpoint

The webhook is how Stripe tells the app that a customer paid, renewed,
or canceled.

1. **Developers → Webhooks → Add endpoint.**
2. Endpoint URL: `https://<your-domain>/api/billing/webhook` (for local
   dev, see "Stripe CLI" below — you don't add a real endpoint).
3. Select events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Save. Click into the endpoint, reveal the **Signing secret**
   (`whsec_…`), copy into `.env` as `STRIPE_WEBHOOK_SECRET`.

### 1.4 Customer Portal

Lets users cancel, switch plans, update card, and see invoices without
emailing support.

1. **Settings → Billing → Customer portal.**
2. Turn ON: Cancellations, Subscription cancellation reason, Invoice history,
   Plan changes (between Monthly and Yearly), Update payment method, Update
   billing address.
3. Set the **Default return URL** to `https://<your-domain>/account/billing`.
4. Save.

### 1.5 Local dev with Stripe CLI

For testing checkout end-to-end before deploying:

```powershell
# Install: https://docs.stripe.com/stripe-cli
# Authenticate once:
stripe login

# Forward webhook events to the local server:
stripe listen --forward-to http://localhost:5000/api/billing/webhook

# The CLI prints a fresh whsec_… key the first time; paste that into
# STRIPE_WEBHOOK_SECRET in .env and restart the dev server.

# Trigger a test event:
stripe trigger checkout.session.completed
```

Use Stripe's [test card](https://docs.stripe.com/testing) `4242 4242 4242 4242`
with any future expiry and any CVC for the actual checkout flow.

### 1.6 Tax (if you sell internationally)

1. **Settings → Tax → Enable Stripe Tax** if you want VAT / GST / sales
   tax computed automatically at checkout.
2. Add tax-relevant addresses (your business address, customers' locations
   you want to register).
3. No code change needed; the existing Checkout Session has
   `billing_address_collection: "auto"` which lets Stripe compute tax.

---

## 2. Resend — transactional email (magic links + receipts)

Stripe sends payment receipts on its own. The only outbound email we send
is the **magic-link** login (also doubles as password reset).

### 2.1 Domain verification

1. Sign up at <https://resend.com>.
2. **Domains → Add domain.** Use a subdomain like `mail.chessfinderpro.com`
   so your root domain's deliverability isn't on the line if Resend has a bad
   day.
3. Add the listed DNS records at your registrar:
   - SPF (TXT)
   - DKIM (CNAMEs — usually three)
   - DMARC (TXT, start at `p=none` and tighten to `quarantine` after a
     week of clean reports)
4. Wait for **Verified**.

### 2.2 API key

1. **API Keys → Create API key.** Sending access only is enough.
2. Paste into `.env` as `RESEND_API_KEY`.

### 2.3 Sender address

Set `RESEND_FROM` to something like:

```
RESEND_FROM=Chess Finder Pro <noreply@mail.chessfinderpro.com>
```

Until both the domain is verified and you've sent a few real emails,
Gmail and Outlook will route magic links to spam.

---

## 3. Google Analytics 4 + Google Ads

### 3.0 Render / Vite (read this first on production)

`VITE_*` variables are **inlined at client build time** by Vite. They are not
read at runtime from the Node server process.

1. In the Render **Web Service** (not the Postgres add-on): **Environment →
   Environment Variables**, add:
   - `VITE_GA4_MEASUREMENT_ID` = your `G-…` ID (optional but recommended).
   - `VITE_GOOGLE_ADS_ID` = your `AW-…` ID (optional; for Ads conversions).
   - `VITE_GOOGLE_ADS_CONVERSION_LABEL` = the label string from the Purchase
     conversion action (required for Ads **only if** you set
     `VITE_GOOGLE_ADS_ID`; omit both to skip Ads tagging).
2. **Save**, then trigger a **new deploy** so `npm run build` runs again with
   those values. A service restart alone is **not** enough.
3. If tags still do not appear after setting vars: **Manual Deploy → Clear
   build cache & deploy** (Render caches dependency/build layers).
4. In the browser, open the site, click **Accept all** on the cookie banner,
   then use Tag Assistant — events stay gated until consent (Consent Mode v2).

### 3.1 Create the GA4 property

1. <https://analytics.google.com> → **Admin → Create → Property.**
2. Name: "Chess Finder Pro". Time zone + currency to taste.
3. After creation: **Data Streams → Web → Add stream.** URL = your
   production origin, Stream name = "Web".
4. Copy the **Measurement ID** (`G-XXXXXXXX`) into **Render env** (and local
   `.env`) as `VITE_GA4_MEASUREMENT_ID`, then rebuild the client (see §3.0).

The app already fires these GA4 events (gated by Consent Mode v2):

| Event              | Fired from                                              |
| ------------------ | ------------------------------------------------------- |
| `page_view`        | every route change (see `client/src/App.tsx`)           |
| `sign_up`          | successful register (email)                             |
| `login`            | successful email sign-in                                |
| `magic_link_requested` | "Email me a link" button on `/login`                |
| `begin_checkout`   | clicking Start monthly/yearly on `/pricing`             |
| `purchase`         | `/thanks` page once subscription is confirmed active    |

### 3.2 Create the Google Ads account + conversion

1. <https://ads.google.com> → create the account. **Switch to expert
   mode** before creating the first campaign so you get the conversion
   tracking UI.
2. **Tools → Conversions → New conversion action → Website → Add manually.**
3. Configure:
   - Goal: Purchase.
   - Conversion name: "Pro subscription start".
   - Value: "Use different values for each conversion" (the app sends
     12.99 or 79 depending on plan).
   - Count: "One" (don't double-count when a user buys again later;
     they're a renewal at that point, not a new acquisition).
   - Click-through conversion window: 30 days.
   - Attribution model: Data-driven (default).
4. Save. You'll get a **Conversion ID** (`AW-XXXXXXXXXX`) and a
   **Conversion label** (a short string).
5. Paste into **Render env** (and local `.env`) — still `VITE_` names — then
   rebuild the client (see §3.0):

   ```
   VITE_GOOGLE_ADS_ID=AW-XXXXXXXXXX
   VITE_GOOGLE_ADS_CONVERSION_LABEL=<conversion label>
   ```

6. Skip the "Install tag" wizard — the app already injects the tag via
   `client/index.html` and fires the conversion from `/thanks` (see
   `client/src/lib/analytics.ts:trackPurchase`).

### 3.3 Link Ads to GA4

1. In Ads, **Tools → Linked accounts → Google Analytics (GA4) → Link.**
2. Pick the GA4 property created in 3.1, link both data sharing and
   auto-tagging.
3. (Later) Use this link to import GA4 audiences into Ads for
   remarketing once you have enough traffic.

### 3.4 Verify the tag

1. Install the [Google Tag Assistant](https://tagassistant.google.com/)
   Chrome extension.
2. Visit your production URL, click **Accept all** in the cookie banner.
3. Tag Assistant should show:
   - `G-…` → page_view firing.
   - `AW-…` → page_view + (after a test purchase) `conversion` firing.
4. Run a Stripe test purchase end-to-end with card `4242 4242 4242 4242`;
   confirm the conversion appears under **Ads → Conversions** within 24h.

### 3.5 Identity verification (required before scaling)

Google requires advertiser identity verification before showing your ads
broadly. Submit it as soon as your account is created so the review
finishes in parallel with everything else:

1. <https://support.google.com/adspolicy/answer/9991401>
2. Provide business name, legal entity, address, and a representative
   government ID. The same business name + address must appear on the
   `/legal/contact` page on the site.

---

## 4. Domain, HTTPS, and `APP_PUBLIC_ORIGIN`

Google Ads cannot run to `localhost`. Before submitting a campaign for
review you need:

- A custom domain (e.g. `chessfinderpro.com`).
- HTTPS via Let's Encrypt / Cloudflare / your platform's TLS.
- `APP_PUBLIC_ORIGIN=https://chessfinderpro.com` set on the server so
  magic-link and OAuth redirects use the correct origin.
- Update `LICHESS_REDIRECT_URI` to `https://chessfinderpro.com/api/auth/lichess/callback`.
- Update `client/public/robots.txt` and `client/public/sitemap.xml` —
  replace `chessfinderpro.com` placeholders with your real domain.

---

## 5. Legal pages

The pages at `/legal/privacy`, `/legal/terms`, `/legal/refund`, and
`/legal/contact` ship with **draft boilerplate**. Before launch:

1. Have a lawyer who handles SaaS / subscription terms review and adapt
   them for your jurisdiction. The drafts cover the topics Google Ads,
   Stripe, and GDPR / CCPA require, but jurisdictional details matter.
2. Replace the placeholder business name, business address, and contact
   emails on `/legal/contact` with your real entity. Google's identity
   verification cross-checks against this page.
3. Replace `support@chessfinderpro.com`, `privacy@chessfinderpro.com`,
   `security@chessfinderpro.com`, and `hello@chessfinderpro.com` with
   real, monitored addresses.

---

## 6. Definition of done

Before submitting your first Google Ads campaign for review, confirm:

- [ ] `VITE_GA4_MEASUREMENT_ID` / Ads vars are set on **Render** and a **full
      rebuild** completed after the last change (§3.0).
- [ ] Stripe test mode end-to-end works: pick a plan, pay with
      `4242 4242 4242 4242`, land on `/thanks`, see "Welcome to Pro",
      open `/account/billing` and the Stripe portal launches.
- [ ] Tag Assistant on production shows `page_view` after consent
      acceptance and `conversion` after a successful test purchase.
- [ ] `/legal/privacy`, `/legal/terms`, `/legal/refund`, `/legal/contact`
      all load with real business info filled in.
- [ ] `/sitemap.xml` and `/robots.txt` are served with the real domain.
- [ ] OG preview looks correct when you paste the URL into Twitter / X,
      Discord, or iMessage (paste the URL, wait a beat, look at the
      preview card).
- [ ] Google Ads identity verification submitted.
- [ ] Resend domain is **Verified** and at least one magic-link email
      arrives in a Gmail / Outlook inbox without going to spam.

Once all six boxes are checked, flip Stripe to live mode, set
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the live values, and
you're ready to draft the actual ad campaign (audience, keywords, copy,
budget — see the conversation that produced this checklist for the
campaign plan).
