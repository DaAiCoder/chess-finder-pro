/**
 * FAQ fallback when no cloud LLM is configured (or as first-line keyword match).
 */
const FAQ: { keys: RegExp; answer: string }[] = [
  {
    keys: /trial|free.?day|3.?day/i,
    answer:
      "Every new account gets a **3-day Pro trial** with full access. After that, subscribe at [Pricing](/pricing) (monthly or yearly) or continue on the free tier (15 puzzles/day for signed-in users).",
  },
  {
    keys: /cancel|unsubscribe|stop.?billing/i,
    answer:
      "Open [Billing & plan](/account/billing) → **Manage in Stripe** to cancel or update your card. Cancellation keeps Pro until the end of the paid period.",
  },
  {
    keys: /refund|money.?back|chargeback/i,
    answer:
      "See our [refund policy](/legal/refund): **7-day unconditional refund** on your first paid charge. Email us via [Contact](/legal/contact) before opening a chargeback — we resolve billing issues quickly.",
  },
  {
    keys: /sign.?in|log.?in|password|magic.?link|forgot/i,
    answer:
      "Go to [Sign in](/login). Use email+password, **magic link** (passwordless), or **Lichess**. Forgot password? Click **Forgot?** on login for a reset email. Change email: [Account](/account) → Security.",
  },
  {
    keys: /price|cost|monthly|yearly|subscribe|pro.?plan/i,
    answer:
      "Plans are on [Pricing](/pricing): **~$12.99/month** or **~$79/year** after your 3-day trial. Yearly saves vs paying monthly.",
  },
  {
    keys: /limit|puzzle.?cap|how many|daily/i,
    answer:
      "**Guests:** 5 puzzles/day. **Free signed-in:** 15/day. **Pro** (trial or subscription): unlimited. Limits reset at UTC midnight.",
  },
  {
    keys: /lichess|chess\.com|oauth/i,
    answer:
      "We support **Login with Lichess** at [Sign in](/login). Chess.com does not offer login OAuth — you can still **import** Chess.com games after signing in.",
  },
  {
    keys: /contact|human|support.?team|email.?you/i,
    answer:
      "Need a person? Use our [Contact form](/legal/contact) — we reply within **2 business days** for support, billing, and privacy requests.",
  },
  {
    keys: /billing|invoice|card|stripe|payment.?fail/i,
    answer:
      "Manage billing at [Account → Billing](/account/billing). Update your card in the Stripe portal. If payment failed, fix the card there and Pro access restores on successful charge.",
  },
];

export function offlineSupportReply(message: string): string | null {
  const q = message.trim();
  if (!q) return null;
  for (const row of FAQ) {
    if (row.keys.test(q)) return row.answer;
  }
  return null;
}

export async function* iterOfflineSupportReply(message: string): AsyncGenerator<string, void, void> {
  const text =
    offlineSupportReply(message) ??
    "I'm not sure about that. Try asking about **trial**, **pricing**, **sign-in**, **billing**, or **puzzle limits** — or [contact our team](/legal/contact) for human help.";
  for (const word of text.split(/(\s+)/)) {
    yield word;
    await new Promise((r) => setTimeout(r, 8));
  }
}
