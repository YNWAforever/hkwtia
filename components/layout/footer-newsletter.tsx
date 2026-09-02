"use client";

import {useState, type FormEvent} from "react";

import {Eyebrow} from "@/components/wt/eyebrow";
import {siteConfig} from "@/config/site";

export type FooterNewsletterLabels = Readonly<{
  eyebrow: string;
  title: string;
  emailLabel: string;
  placeholder: string;
  submit: string;
  success: string;
  error: string;
  mailSubject: string;
  /** Carries a literal `{email}` placeholder; interpolated here, not by next-intl. */
  mailBody: string;
}>;

/**
 * D-6: there is no persisted subscriber model and adding one is a separate product decision,
 * so this prepares an email and hands over to the reader's mail client exactly as the donor
 * does (commit f91ecc5 :512-517). `noValidate` is deliberate — the block owns its own
 * validation message so the browser bubble cannot replace the `role="alert"` text.
 */
export function FooterNewsletter({labels}: {labels: FooterNewsletterLabels}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "success">("idle");
  // Also the form's `action`, so the block degrades. That attribute is never used while the
  // island is live — `subscribe` calls preventDefault first — but without it a reader with
  // JavaScript off submits a form that does nothing at all, which is worse than the donor's
  // behaviour rather than equal to it.
  const mailto = `mailto:${siteConfig.contact.email}`;

  function subscribe(event: FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      return;
    }
    setState("success");
    const subject = encodeURIComponent(labels.mailSubject);
    const body = encodeURIComponent(labels.mailBody.replace("{email}", email));
    window.location.assign(`${mailto}?subject=${subject}&body=${body}`);
  }

  return (
    <div className="footer-newsletter">
      <Eyebrow light>{labels.eyebrow}</Eyebrow>
      <h2>{labels.title}</h2>
      {state === "success" ? (
        <div className="newsletter-success" role="status">
          <span aria-hidden="true">↗</span>
          <p>{labels.success}</p>
        </div>
      ) : (
        <form noValidate action={mailto} onSubmit={subscribe}>
          <label className="sr-only" htmlFor="footer-newsletter-email">{labels.emailLabel}</label>
          <input
            id="footer-newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={320}
            value={email}
            placeholder={labels.placeholder}
            aria-invalid={state === "error"}
            onChange={(event) => {
              setEmail(event.target.value);
              setState("idle");
            }}
          />
          <button type="submit" aria-label={labels.submit}>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
      {state === "error" ? (
        <p className="newsletter-error" role="alert">{labels.error}</p>
      ) : null}
    </div>
  );
}
