import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {parsePortalContinuation} from "@/lib/portal/continuation";
import {localizedPath} from "@/lib/urls";

import {requestMemberLoginLink} from "./actions";

// A login utility page, not marketing content — never indexed.
export const metadata: Metadata = {robots: {index: false, follow: false}};

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorMessageKey(code: string | undefined): "errors.email" | "errors.invalidContinuation" | "errors.rateLimited" | "errors.auth" | null {
  switch (code) {
    case "invalid_email": return "errors.email";
    case "invalid_continuation": return "errors.invalidContinuation";
    case "rate_limited": return "errors.rateLimited";
    case "provider_error": return "errors.auth";
    default: return null;
  }
}

export default async function MemberLoginPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const [t, tNav] = await Promise.all([getTranslations("MemberLogin"), getTranslations("Navigation")]);

  // Fails open to /portal for a stale or tampered `next` — this page must
  // never surface an error to a visitor over an invalid continuation alone.
  const continuation = parsePortalContinuation(queryValue(query.next));

  // Clicking the magic-link email lands the browser back here already
  // authenticated (Neon Auth verifies the token and redirects to this
  // callback URL). Forward immediately, mirroring /join's page.tsx — this
  // page must never leave an authenticated visitor stranded on a login
  // form with no way to reach /portal.
  const actor = await getActor().catch(() => null);
  if (actor) {
    redirect(localizedPath(locale, continuation));
  }
  const sent = Boolean(queryValue(query.sent));
  const errorKey = errorMessageKey(queryValue(query.error));

  async function submitMemberLogin(formData: FormData): Promise<void> {
    "use server";
    const result = await requestMemberLoginLink({email: formData.get("email"), next: continuation}, locale);
    const {redirect} = await import("next/navigation");
    const target = new URLSearchParams({next: continuation});
    if (result.ok) {
      target.set("sent", "1");
    } else {
      target.set("error", result.error);
    }
    redirect(`${localizedPath(locale, "/member-login")}?${target.toString()}`);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link aria-label={tNav("homeLabel")} className="inline-flex min-h-11 items-center gap-3" href="/">
            <Image alt={tNav("logoAlt")} height={40} src="/images/wtia-logo.png" width={112} />
            <span className="text-lg font-semibold text-primary">{tNav("brand.publicName")}</span>
          </Link>
          <nav aria-label={t("navigation")} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link className="min-h-11 content-center underline-offset-4 hover:underline" href="/">{t("home")}</Link>
            <Link className="min-h-11 content-center underline-offset-4 hover:underline" href="/join">{t("join")}</Link>
            <Link className="min-h-11 content-center underline-offset-4 hover:underline" href="/admin-login">{t("staffSignIn")}</Link>
            <a className="min-h-11 content-center underline-offset-4 hover:underline" href={`mailto:${siteConfig.contact.email}`}>{t("support")}</a>
          </nav>
        </header>
        <section aria-labelledby="login-heading" className="glass-card mx-auto max-w-xl p-6 sm:p-10">
          <h1 className="font-serif text-4xl font-semibold" id="login-heading">{t("formLabel")}</h1>
          <p className="mt-3 text-muted-foreground">{t("help")}</p>
          {sent ? <p className="mt-4" role="status">{t("sent")}</p> : null}
          {errorKey ? <p className="mt-4 text-sm text-destructive" role="alert">{t(errorKey)}</p> : null}
          <form action={submitMemberLogin} className="mt-8" data-continuation={continuation} data-testid="member-login-form">
            <label className="mb-2 block text-sm font-medium" htmlFor="email">{t("emailLabel")}</label>
            <input autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="email" name="email" required type="email" />
            <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t(sent ? "resend" : "submit")}</button>
          </form>
          <p className="mt-5 text-sm text-muted-foreground">{t("deliveryHelp")}</p>
        </section>
      </div>
    </main>
  );
}
