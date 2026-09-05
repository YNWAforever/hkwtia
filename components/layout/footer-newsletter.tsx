"use client";

import {useEffect, useId, useRef, useState, type FormEvent} from "react";

import {Eyebrow} from "@/components/wt/eyebrow";
import {siteConfig} from "@/config/site";
import {usePathname} from "@/i18n/navigation";

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

/**
 * D-6: there is no persisted subscriber model and adding one is a separate product decision,
 * so this prepares an email and hands over to the reader's mail client exactly as the donor
 * does (commit f91ecc5 :512-517). `noValidate` is deliberate — the block owns its own
 * validation message so the browser bubble cannot replace the `role="alert"` text.
 */
export function FooterNewsletter({labels}: {labels: FooterNewsletterLabels}) {
  // The site-wide footer mounts this island on every public page, and some pages (e.g. /news's
  // `.news-subscribe-band`) mount a second instance directly in the body above it. Two instances
  // sharing one literal id would leave the document with duplicate ids: per HTML `for`/
  // `aria-describedby` semantics the browser resolves to the *first* matching id, so the second
  // instance's label and error text would silently bind to the first instance's input instead
  // of its own (WCAG 1.3.1/4.1.1). `useId()` gives each mounted instance its own stable prefix.
  const instanceId = useId();
  const emailId = `${instanceId}-email`;
  const errorId = `${instanceId}-error`;
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
   * Read during render and compared with the route this island last rendered for — the pattern
   * the Concierge already uses (components/ai/concierge-widget.tsx:230-241), for the same
   * reason. This island is mounted by app/[locale]/(public)/layout.tsx, which survives every
   * in-app navigation, so a success held in state hid the form on every *other* public page
   * for the rest of the session, and a half-typed address followed the reader off the page
   * they typed it on. Resetting here makes the persistent island behave like the per-page form
   * a reader takes it for. Setting state during render is React's own way to adjust state when
   * an input changes: React re-runs this component before committing, so no frame ever paints
   * the stale panel, which an effect would.
   */
  const pathname = usePathname();
  const [renderedRoute, setRenderedRoute] = useState(pathname);
  if (renderedRoute !== pathname) {
    setRenderedRoute(pathname);
    setState("idle");
    setEmail("");
  }
  /**
   * Two addresses, one route.
   *
   * `mailFallback` is the route that works: an ordinary link, followed with or without script,
   * carrying the subject. The typed address cannot travel it — composing the body needs the
   * script — but it reaches a titled draft addressed to WTIA, and it is rendered always rather
   * than inside `<noscript>`, whose children are a hydration hazard in a client component.
   *
   * `mailto` stays on the form as an intentionally *inert* action, not as a fallback:
   * next.config.ts sends `form-action 'self'` (:41) on `/:path*` (:153), a `mailto:` URL
   * matches no source in that list, and the browser therefore refuses the submission outright —
   * no navigation, no query string. Deleting it would not restore a fallback, it would open a
   * leak: a form with no `action` submits to its own URL, which the policy does allow, so a
   * no-script submit would reload the public page with the reader's address in the query
   * string. `form-action` does not govern link navigation and this partial policy declares no
   * `default-src`, so nothing constrains following `mailFallback`.
   */
  const mailto = `mailto:${siteConfig.contact.email}`;
  const mailFallback = `${mailto}?subject=${encodeURIComponent(labels.mailSubject)}`;

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
    // The function form of `replace`: `$&`, "$`" and `$'` are replacement patterns, so a typed
    // address containing one would otherwise rewrite the sentence around it.
    const body = encodeURIComponent(labels.mailBody.replace("{email}", () => email));
    // The same address the link offers, plus the body only the script can build, so the two
    // routes cannot drift into titling the draft differently.
    window.location.assign(`${mailFallback}&body=${body}`);
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
        <label className="sr-only" htmlFor={emailId}>{labels.emailLabel}</label>
        <input
          id={emailId}
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
        {/* The port gives this button a width but no height, so its 44px would come only from
            the input stretching the flex row (spec §2.9). */}
        <button className="min-h-11" type="submit" aria-label={labels.submit}>
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="newsletter-error" id={errorId} role="alert">
        {state === "error" ? <span key={attempt}>{labels.error}</span> : null}
      </p>
      {/* Outside the form, so the success panel never takes it away: a reader whose mail client
          did not open is exactly the one who needs it. No port rule targets `.footer-newsletter
          a`, so the type comes from utilities here rather than from a stylesheet this file does
          not own; `min-h-11` is hkwtia's own tap-target floor (spec §2.9). */}
      <a
        className="mt-4 inline-flex min-h-11 items-center text-[11px] text-white/70 underline underline-offset-4 hover:text-white"
        href={mailFallback}
      >
        {labels.submit}
      </a>
    </div>
  );
}
