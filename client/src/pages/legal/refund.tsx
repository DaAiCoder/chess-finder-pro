import { LegalLayout } from "@/components/LegalLayout";

export default function RefundPage() {
  return (
    <LegalLayout title="Refund Policy" effectiveDate="May 13, 2026">
      <p>
        We want you to feel good about paying for Chess Finder Pro. This page
        describes when and how you can get a refund.
      </p>

      <h2>7-day refund on first paid period</h2>
      <p>
        If you're unhappy with Chess Finder Pro for any reason within the first{" "}
        <strong>7 days</strong> after your initial paid charge (monthly or
        yearly), email us via the <a href="/legal/contact">contact page</a> and
        we will refund the period in full. No interrogation, no "win-back"
        flow.
      </p>

      <h2>Monthly renewals</h2>
      <p>
        After the first 7 days, monthly renewals are non-refundable. You can
        cancel anytime from the in-app billing portal and your access will
        continue until the end of the period you already paid for.
      </p>

      <h2>Yearly subscriptions</h2>
      <p>
        Yearly subscriptions can be canceled at any time. After the first 7
        days, we don't offer prorated refunds on the remaining unused months
        by default — but if your circumstances have meaningfully changed (job
        loss, medical emergency, account never used), contact us and we'll
        review your case.
      </p>

      <h2>Failed payments</h2>
      <p>
        If your card is declined at renewal, Stripe will retry automatically
        for a few days and email you. If we still can't collect after that
        window, your subscription downgrades to the free plan; no refund is
        owed in that case.
      </p>

      <h2>How to request a refund</h2>
      <ol>
        <li>
          Email us via the <a href="/legal/contact">contact page</a> with the
          email address on your account and a brief reason. The reason isn't
          required for a 7-day refund but it helps us improve the product.
        </li>
        <li>
          We process refunds back to the original payment method through
          Stripe within 3 business days of the request.
        </li>
        <li>
          Your bank typically posts the refund within 5–10 business days,
          depending on the card network.
        </li>
      </ol>

      <h2>Chargebacks</h2>
      <p>
        If you're unhappy, please email us first — we're a small team and the
        7-day refund is unconditional. Chargebacks initiated without contacting
        us add fees and may lead to account suspension; we'd rather just refund
        you.
      </p>

      <h2>Promotional pricing</h2>
      <p>
        Discounted or promotional subscriptions are refundable on the same
        terms above (the refund covers the discounted amount actually charged).
      </p>
    </LegalLayout>
  );
}
