import { LegalLayout } from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" effectiveDate="May 13, 2026">
      <p>
        These Terms of Service ("Terms") govern your use of ChessGM
        ("the Service"). By creating an account, signing in, or paying for a
        subscription, you agree to these Terms. If you don't agree, don't use
        the Service.
      </p>

      <h2>1. What the Service is</h2>
      <p>
        ChessGM is a chess training platform. It includes the Ask Tal
        AI coach, deep analysis tools, training modules, opening prep,
        repertoire drilling, and game library tools. Some features are free;
        others require an active "Pro" subscription.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 13 years old to create an account.</li>
        <li>
          You're responsible for your account and for keeping your credentials
          secure. Pick a strong password. If you suspect unauthorized access,
          change your password and contact us.
        </li>
        <li>
          You may sign in with Lichess. We only receive your public Lichess
          username; we never see your Lichess password or game tokens beyond
          what's necessary to identify you.
        </li>
        <li>
          You may not share your account, transfer it, or use it on behalf of
          someone else without our written consent.
        </li>
      </ul>

      <h2>3. Subscriptions and billing</h2>
      <ul>
        <li>
          Pro subscriptions are billed monthly or yearly, in advance, by Stripe
          using the price shown on the <a href="/pricing">pricing page</a> at
          the time of purchase.
        </li>
        <li>
          Subscriptions renew automatically at the end of each period until you
          cancel. We will not charge a renewal price higher than the one you
          agreed to without notifying you first.
        </li>
        <li>
          You can cancel anytime from the in-app billing portal. Cancellation
          stops future renewals; you keep Pro access until the end of the
          current paid period.
        </li>
        <li>
          Refunds are governed by our <a href="/legal/refund">refund policy</a>.
        </li>
        <li>
          Taxes (VAT, GST, sales tax) may be added at checkout depending on
          your location; Stripe handles tax computation.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Scrape, redistribute, or commercially resell the Service's outputs
          (analysis, coach explanations, generated content) without our written
          permission.
        </li>
        <li>
          Attempt to bypass paywalls, rate limits, or authentication. Don't run
          automated bots or stress-test the Service.
        </li>
        <li>
          Upload PGNs, comments, or other content that's illegal, infringing,
          harassing, hateful, or otherwise objectionable.
        </li>
        <li>
          Reverse-engineer or attempt to extract our model weights, system
          prompts, or training data.
        </li>
      </ul>
      <p>We may suspend or terminate accounts that violate these rules.</p>

      <h2>5. Your content</h2>
      <p>
        You keep ownership of the games and content you upload. You grant us a
        non-exclusive license to store, process, and display that content as
        necessary to provide the Service to you (e.g. running analysis,
        rendering boards, training the in-app weakness map for your account).
        We do not use your private content to train shared AI models.
      </p>

      <h2>6. AI-generated content</h2>
      <p>
        The Ask Tal coach and other AI features use third-party language models
        plus our own analysis tooling. AI output can be incorrect, incomplete,
        or impersonate famous players in style only. We don't warrant that
        coach explanations are correct; double-check critical moves against an
        engine. We are not affiliated with, endorsed by, or representing any
        world champion whose playing style we emulate.
      </p>

      <h2>7. Service availability and changes</h2>
      <p>
        We aim for high availability but do not guarantee uninterrupted
        service. We may add, remove, or change features over time. Material
        downgrades to Pro features will be announced reasonably in advance.
      </p>

      <h2>8. Termination</h2>
      <p>
        You can close your account at any time via the contact page. We may
        suspend or terminate your account if you violate these Terms, if your
        payment fails, or if continuing the relationship would expose us to
        legal risk.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES
        OF ANY KIND, EXPRESS OR IMPLIED. WE DISCLAIM IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT, TO THE EXTENT PERMITTED BY LAW.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY
        CLAIM RELATED TO THE SERVICE IS CAPPED AT THE AMOUNTS YOU HAVE PAID US
        IN THE 12 MONTHS PRECEDING THE CLAIM. WE ARE NOT LIABLE FOR INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which the
        operator is established. Disputes will be resolved in the courts of
        that jurisdiction unless a mandatory consumer-protection law in your
        country says otherwise.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms over time. Material changes will be announced
        at least 14 days in advance via email or an in-app banner. Continuing
        to use the Service after the effective date constitutes acceptance.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms? See the{" "}
        <a href="/legal/contact">Contact page</a>.
      </p>
    </LegalLayout>
  );
}
