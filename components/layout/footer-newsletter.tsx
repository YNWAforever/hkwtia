"use client";

import {useEffect, useRef, useState, type FormEvent} from "react";

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
 * Deliberately stricter than the donor's `includes("@")` (commit f91ecc5 :514), which accepts
 * "@", "@@" and " @ " — three ways to reach a mail client with nothing to send. Not Zod: this
 * is a client-only convenience before a `mailto:` handoff, nothing is persisted, and no other
 * module in the public client bundle imports Zod, so pulling it in for one field would be the
 * island's largest dependency. Input that reaches a record is still validated with Zod at the
 * repository boundary, where it matters.
 */
const usableAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorId = "footer-newsletter-error";

/**
 * D-6: there is no persisted subscriber model and adding one is a separate product decision,
 * so this prepares an email and hands over to the reader's mail client exactly as the donor
 * does (commit f91ecc5 :512-517). `noValidate` is deliberate — the block owns its own
 * validation message so the browser bubble cannot replace the `role="alert"` text.
 */
export function FooterNewsletter({labels}: {labels: FooterNewsletterLabels}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "success">("idle");
  /**
   * Every submit gets its own number, and the alert's text is keyed on it. Clearing the state
   * before re-validating is not enough on its own: React batches the reset and the re-flag into
   * a single commit, so submitting the same wrong address twice would leave the alert's words
   * byte-identical and the live region would observe no mutation to announce. Replacing the
   * node is a mutation it does observe.
   */
  const [attempt, setAttempt] = useState(0);
  const successRef = useRef<HTMLDivElement>(null);
  /**
   * Also the form's `action`. Without script the browser GETs this address with the form fields
   * appended as a query string; mail clients honour `subject` and ignore anything else, so the
   * reader reaches a titled but empty message addressed to WTIA rather than a form that does
   * nothing at all. The typed address cannot travel that route — composing the body needs the
   * script — but a working route beats an inert one.
   */
  const mailto = `mailto:${siteConfig.contact.email}`;

  // The success panel takes the form's place, so the button the reader just activated goes
  // `hidden`. Without moving focus, it falls to <body> and the reader loses their position in
  // the page as well as the confirmation (WCAG 2.4.3).
  useEffect(() => {
    if (state === "success") successRef.current?.focus();
  }, [state]);

  function subscribe(event: FormEvent) {
    event.preventDefault();
    setAttempt((previous) => previous + 1);
    if (!usableAddress.test(email)) {
      setState("error");
      return;
    }
    setState("success");
    const subject = encodeURIComponent(labels.mailSubject);
    // The function form of `replace`: `$&`, "$`" and `$'` are replacement patterns, so a typed
    // address containing one would otherwise rewrite the sentence around it.
    const body = encodeURIComponent(labels.mailBody.replace("{email}", () => email));
    window.location.assign(`${mailto}?subject=${subject}&body=${body}`);
  }

  return (
    <div className="footer-newsletter">
      <Eyebrow light>{labels.eyebrow}</Eyebrow>
      <h2>{labels.title}</h2>
      {/* Both live regions are mounted from the first render and never unmount. A region the
          reader's software first meets at the moment its text arrives is a region that may
          never announce that text. The donor's class lands only when there is something to
          show, so the idle panel is not a permanently empty bordered box. */}
      <div
        className={state === "success" ? "newsletter-success" : undefined}
        ref={successRef}
        role="status"
        tabIndex={-1}
      >
        {state === "success" ? (
          <>
            <span aria-hidden="true">↗</span>
            <p>{labels.success}</p>
          </>
        ) : null}
      </div>
      <form noValidate action={mailto} hidden={state === "success"} onSubmit={subscribe}>
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
          aria-describedby={state === "error" ? errorId : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setState("idle");
          }}
        />
        {/* Carried for the no-script route only; the script builds its own subject. */}
        <input name="subject" type="hidden" value={labels.mailSubject} readOnly />
        {/* The port gives this button a width but no height, so its 44px would come only from
            the input stretching the flex row (spec §2.9). */}
        <button className="min-h-11" type="submit" aria-label={labels.submit}>
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="newsletter-error" id={errorId} role="alert">
        {state === "error" ? <span key={attempt}>{labels.error}</span> : null}
      </p>
    </div>
  );
}
