/**
 * Product knowledge injected into the support assistant system prompt.
 * Keep factual — the model should not invent pricing or policies beyond this.
 */
export const SUPPORT_KNOWLEDGE = `
# Chess Finder Pro — support knowledge (chessgm.co)

## Product
Chess Finder Pro is a chess training web app: analysis, opponent prep, tactics/endgame/opening trainers, game library, and "Ask Tal" AI coach.

## Plans & trial
- Every new member account gets a **3-day full Pro trial** (all features).
- After trial: subscribe **monthly (~$12.99/mo)** or **yearly (~$79/yr)** at /pricing.
- Guests (not signed in): limited preview; sidebar hidden on marketing pages.
- Free signed-in (post-trial, no subscription): **15 training puzzles/day**; core trainers.
- Anonymous (no account): **5 puzzles/day**.
- Pro (trial, active subscription, or complimentary): unlimited training + personalized Pro trainers.

## Sign in & account
- Sign up / sign in: /login or /signup (email+password, magic link, or Lichess OAuth).
- Forgot password: "Forgot?" on login → email reset link → /reset-password.
- Change email while signed in: /account → Security. Signed out: /email-change.
- Magic link: passwordless sign-in email (15 min, one-time).
- Lichess login does not require a Chess.com account (Chess.com has no OAuth).

## Billing
- Subscribe: /pricing → Stripe Checkout (card).
- Manage card, invoices, cancel: /account/billing → Stripe Customer Portal.
- Refund policy: /legal/refund — 7-day unconditional refund on first paid charge; contact us before chargebacks.
- Payment issues: update card in billing portal; check email from Stripe.

## Training & Pro gates
- Pro-only modules include weekly plan, repertoire trainer, calculation ladder, time pressure, pawn structures, calculation studio, personalized library generation.
- Daily limits reset at UTC midnight.

## Key URLs
- Pricing: /pricing
- Account: /account
- Billing: /account/billing
- Contact human support: /legal/contact (form + email)
- Privacy: /legal/privacy
- Terms: /legal/terms
- Refunds: /legal/refund

## Escalation
If the user needs a human, billing dispute, data deletion (GDPR), or security issue — direct them to [/legal/contact](/legal/contact) and mention we aim to reply within 2 business days.
`.trim();

export const SUPPORT_STARTER_PROMPTS = [
  "How does the free trial work?",
  "How do I cancel my subscription?",
  "I can't sign in — help",
  "What's included in Pro?",
  "How do daily puzzle limits work?",
] as const;
