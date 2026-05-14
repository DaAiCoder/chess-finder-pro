/**
 * Minimal outbound email for magic links.
 *
 * - **Resend** (recommended): `RESEND_API_KEY`, optional `RESEND_FROM`
 *   (default `ChessFinderPro <onboarding@resend.dev>`).
 * - **Fallback**: logs the link to stdout (dev / misconfiguration).
 */
const RESEND_API = "https://api.resend.com/emails";

export async function sendMagicLinkEmail(args: {
  to: string;
  magicUrl: string;
  appName?: string;
}): Promise<{ ok: boolean; mode: "resend" | "log" }> {
  const app = args.appName ?? "ChessFinderPro";
  const subject = `Sign in to ${app}`;
  const text = `Open this link to sign in (expires in 15 minutes):\n\n${args.magicUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `<p>Click below to sign in to <strong>${escapeHtml(app)}</strong> (link expires in 15 minutes).</p>
<p><a href="${escapeHtml(args.magicUrl)}">Sign in</a></p>
<p style="color:#666;font-size:12px">If you did not request this, you can ignore this email.</p>`;

  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    const from =
      process.env.RESEND_FROM?.trim() || "ChessFinderPro <onboarding@resend.dev>";
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend ${res.status}: ${errText.slice(0, 500)}`);
    }
    return { ok: true, mode: "resend" };
  }

  console.log(
    `[email] Magic link (no RESEND_API_KEY — not sent) to=${args.to}\n${args.magicUrl}`,
  );
  return { ok: true, mode: "log" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
