import * as React from "react";
import { LegalLayout } from "@/components/LegalLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/queryClient";

const TOPICS = [
  { value: "support", label: "General support" },
  { value: "billing", label: "Billing / refund" },
  { value: "privacy", label: "Privacy / data request" },
  { value: "security", label: "Security disclosure" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
] as const;

export default function ContactPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [topic, setTopic] = React.useState<(typeof TOPICS)[number]["value"]>("support");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/api/contact", {
        method: "POST",
        body: JSON.stringify({ name, email, topic, message }),
      });
      setSent(true);
    } catch {
      setErr("Could not send your message. Try again in a few minutes or email us directly.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalLayout title="Contact" effectiveDate="May 13, 2026">
      <p>
        We're a small team. Send the form below and we aim to respond within{" "}
        <strong>2 business days</strong>.
      </p>

      {sent ? (
        <p className="text-sm text-emerald-400/90">
          Message sent — we'll reply to <strong>{email}</strong> soon.
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 max-w-lg not-prose">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Topic</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={topic}
              onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number]["value"])}
            >
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Message</label>
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={5000}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy} style={{ backgroundColor: "#769656", color: "white" }}>
            {busy ? "Sending…" : "Send message"}
          </Button>
        </form>
      )}

      <h2>Direct email</h2>
      <p>You can also reach us directly:</p>
      <ul>
        <li>
          <strong>General support:</strong> support@chessfinderpro.com
        </li>
        <li>
          <strong>Privacy:</strong> privacy@chessfinderpro.com
        </li>
        <li>
          <strong>Security:</strong> security@chessfinderpro.com
        </li>
      </ul>

      <h2>Billing and chargeback questions</h2>
      <p>
        For invoices, double-charges, or billing disputes — please contact us before initiating a
        chargeback. See the <a href="/legal/refund">refund policy</a>.
      </p>
    </LegalLayout>
  );
}
