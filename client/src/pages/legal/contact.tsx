import { LegalLayout } from "@/components/LegalLayout";

export default function ContactPage() {
  return (
    <LegalLayout title="Contact" effectiveDate="May 13, 2026">
      <p>
        We're a small team. The fastest way to reach us is by email — every
        message goes to a real human and we aim to respond within{" "}
        <strong>2 business days</strong>.
      </p>

      <h2>General support</h2>
      <p>
        For account questions, login trouble, refunds, or feature feedback:
      </p>
      <p>
        <strong>support@chessfinderpro.com</strong>{" "}
        <span className="text-xs">
          (replace this with your verified support address before launch)
        </span>
      </p>

      <h2>Privacy and data requests</h2>
      <p>
        For access, correction, export, or deletion requests under GDPR,
        UK GDPR, CCPA, or similar laws:
      </p>
      <p>
        <strong>privacy@chessfinderpro.com</strong>{" "}
        <span className="text-xs">
          (replace this with your verified privacy address before launch)
        </span>
      </p>

      <h2>Billing and chargeback questions</h2>
      <p>
        For invoices, double-charges, or billing disputes — please email us{" "}
        before initiating a chargeback. We refund unconditionally within 7
        days of the first paid charge and quickly outside that window when
        circumstances warrant. See the <a href="/legal/refund">refund policy</a>.
      </p>

      <h2>Security disclosures</h2>
      <p>
        Found a vulnerability? We appreciate responsible disclosure. Email{" "}
        <strong>security@chessfinderpro.com</strong> with details and PoC; we
        respond within 3 business days and credit you in the changelog (with
        permission) once it's fixed.
      </p>

      <h2>Business / partnerships</h2>
      <p>
        Chess teachers, content creators, club organizers, and integrators:{" "}
        <strong>hello@chessfinderpro.com</strong>.
      </p>

      <h2>Company information</h2>
      <p>
        <strong>Chess Finder Pro</strong>
        <br />
        <span className="text-xs">
          [Replace with your registered business name, registration number,
          address, and country before launch — Google Ads identity
          verification will check this.]
        </span>
      </p>
    </LegalLayout>
  );
}
