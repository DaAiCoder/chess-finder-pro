import { LegalLayout } from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" effectiveDate="May 13, 2026">
      <p>
        Chess Finder Pro ("we", "our", "us") is a chess training service. This
        policy explains what personal data we collect, why, how we use it, who
        we share it with, and the rights you have to access, correct, export,
        or delete it.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — username, email address (optional but
          required for password reset and receipts), Lichess handle when you
          sign in with Lichess.
        </li>
        <li>
          <strong>Authentication secrets</strong> — your password is stored as a
          salted <code>scrypt</code> hash; we never see or store the plaintext.
          Magic-link sign-in tokens are stored as SHA-256 hashes and expire
          after 15 minutes.
        </li>
        <li>
          <strong>Training data</strong> — games you import (PGNs), positions
          you analyze, motifs you mark, ratings on internal trainers, repertoire
          trees, saved searches.
        </li>
        <li>
          <strong>Billing data</strong> — subscription plan, status, renewal
          date, and a Stripe customer ID. We do <em>not</em> see or store your
          card details; those live with Stripe.
        </li>
        <li>
          <strong>Cookies and analytics</strong> — see the Cookies section
          below. Analytics events are gated behind your consent choice.
        </li>
        <li>
          <strong>Server logs</strong> — request method, path, status code, and
          rough IP for rate-limiting and abuse detection. We retain these for
          up to 30 days.
        </li>
      </ul>

      <h2>2. Why we collect it</h2>
      <ul>
        <li>To run your account and let you sign in.</li>
        <li>To deliver paid features and process subscription payments via Stripe.</li>
        <li>To send transactional email (magic links, payment receipts) via Resend.</li>
        <li>To prevent brute-force, spam, and abuse (rate limits, login lockouts).</li>
        <li>To understand which features are used so we can prioritize improvements.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell personal information. We do not share
        your training data with advertisers.
      </p>

      <h2>3. Who we share it with (processors)</h2>
      <ul>
        <li>
          <strong>Stripe</strong> — payment processing. Subject to{" "}
          <a href="https://stripe.com/privacy">Stripe's privacy policy</a>.
        </li>
        <li>
          <strong>Resend</strong> — transactional email delivery. Subject to{" "}
          <a href="https://resend.com/legal/privacy-policy">Resend's privacy policy</a>.
        </li>
        <li>
          <strong>Lichess</strong> — only when you choose to sign in with
          Lichess; we receive your public Lichess username.
        </li>
        <li>
          <strong>Google Analytics 4 and Google Ads</strong> — only when you
          give consent via the cookie banner; otherwise these are blocked
          client-side via Consent Mode v2.
        </li>
        <li>
          <strong>Our hosting provider</strong> — required to run the service.
          Encrypted at rest by the provider.
        </li>
      </ul>

      <h2>4. Cookies and tracking</h2>
      <p>
        We use a small number of cookies:
      </p>
      <ul>
        <li>
          <strong>Session cookie</strong> (<code>cfpsid</code> in dev,{" "}
          <code>__Host-cfpsid</code> in production) — strictly necessary, keeps
          you signed in. HttpOnly, SameSite=Lax, Secure in production.
        </li>
        <li>
          <strong>Consent state</strong> (<code>cfp_consent</code> in
          localStorage) — remembers your "accept" / "reject" choice so the
          banner doesn't show up again.
        </li>
        <li>
          <strong>Analytics cookies</strong> (set by Google Tag) — only loaded
          if you click "Accept all" on the cookie banner. Used by Google
          Analytics 4 and Google Ads for visit measurement and conversion
          attribution.
        </li>
      </ul>
      <p>
        You can change your cookie choice at any time by clearing the{" "}
        <code>cfp_consent</code> key in localStorage and refreshing the page.
      </p>

      <h2 id="cookies">5. Your rights</h2>
      <p>
        Depending on your jurisdiction (GDPR, UK GDPR, CCPA, others) you have
        rights to:
      </p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate data.</li>
        <li>Export your data in a portable format.</li>
        <li>
          Delete your account and associated personal data ("right to be
          forgotten").
        </li>
        <li>Withdraw consent for analytics at any time.</li>
        <li>
          Object to or restrict certain processing, and complain to a
          supervisory authority.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email us via the{" "}
        <a href="/legal/contact">contact page</a>. We respond within 30 days.
      </p>

      <h2>6. Retention</h2>
      <ul>
        <li>Account + training data: kept until you delete your account.</li>
        <li>Billing records: retained as required by tax law (typically 7 years).</li>
        <li>Server logs: 30 days.</li>
        <li>Magic-link tokens: 15 minutes.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Passwords are hashed with <code>scrypt</code>; magic-link tokens are
        SHA-256 hashed before storage. All traffic is served over HTTPS.
        Sessions are HttpOnly, SameSite=Lax, Secure in production. We rate-limit
        login, registration, and magic-link requests to limit credential
        stuffing.
      </p>

      <h2>8. Children</h2>
      <p>
        Chess Finder Pro is not directed at children under 13. We do not
        knowingly collect personal data from anyone under 13. If you believe a
        child has provided us data, contact us and we will delete it.
      </p>

      <h2>9. Changes</h2>
      <p>
        If we make material changes to this policy we will update the
        "Effective" date above and, when reasonable, notify you by email or via
        an in-app banner before the change takes effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        For any privacy question or to exercise your rights, see the{" "}
        <a href="/legal/contact">Contact page</a>.
      </p>
    </LegalLayout>
  );
}
