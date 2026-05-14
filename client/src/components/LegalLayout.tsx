import * as React from "react";
import { Link } from "wouter";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * Shared chrome for the static policy pages (Privacy, Terms, Refund, Contact).
 * Renders breadcrumbs, a title, an "effective date" line, and a styled
 * prose container. Includes a prominent "draft" warning when the
 * `draft` flag is set so we don't accidentally ship un-reviewed boilerplate
 * to production without lawyer sign-off.
 */
export function LegalLayout({
  title,
  effectiveDate,
  draft = true,
  children,
}: {
  title: string;
  effectiveDate: string;
  draft?: boolean;
  children: React.ReactNode;
}) {
  useDocumentTitle(`${title} — Chess Finder Pro`);
  return (
    <div className="px-4 py-10 md:py-14 max-w-3xl mx-auto">
      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>{" "}
        / <span className="text-foreground">{title}</span>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-xs text-muted-foreground mt-1">Effective: {effectiveDate}</p>

      {draft && (
        <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <strong>Draft.</strong> This document is a working draft. Have legal
          counsel review and adapt it for your jurisdiction before relying on it
          in production.
        </div>
      )}

      <article
        className="
          mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground
          [&_h2]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-2
          [&_h3]:text-foreground [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-1
          [&_p]:my-2
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1
          [&_a]:text-emerald-400 [&_a]:underline-offset-2 [&_a:hover]:underline
          [&_strong]:text-foreground
        "
      >
        {children}
      </article>
    </div>
  );
}
