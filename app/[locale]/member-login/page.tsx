import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {siteConfig} from "@/config/site";
import {SignInForm} from "@/components/auth/sign-in-form";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {resolveCurrentLogin} from "@/lib/auth/login-resolution-server";
import {provisionMemberProfileAction} from "./provision-action";
import {allowedMemberDestination, parseLoginDestination} from "@/lib/auth/login-destination";
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

function errorMessageKey(code: string | undefined): "errors.email" | "errors.invalidContinuation" | "errors.rateLimited" | "errors.limiterUnavailable" | "errors.auth" | null {
  switch (code) {
    case "invalid_email": return "errors.email";
    case "invalid_continuation": return "errors.invalidContinuation";
    case "rate_limited": return "errors.rateLimited";
    case "limiter_unavailable": return "errors.limiterUnavailable";
    case "provider_error": return "errors.auth";
    default: return code ? "errors.auth" : null;
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
  const requestedDestination = queryValue(query.next);
  const continuation = parseLoginDestination(requestedDestination, "member").path;
  const profileContinuation = allowedMemberDestination(requestedDestination);

  // Clicking the magic-link email lands the browser back here already
  // authenticated (Neon Auth verifies the token and redirects to this
  // callback URL). Forward immediately, mirroring /join's page.tsx — this
  // page must never leave an authenticated visitor stranded on a login
  // form with no way to reach /portal.
  const resolution = await resolveCurrentLogin({intent: "member", path: continuation});
  if (resolution.kind === "allowed") redirect(localizedPath(locale, resolution.destination.path));
  const sent = queryValue(query.sent) === "1";
  const errorKey = errorMessageKey(queryValue(query.error));
  const rawReference = queryValue(query.reference);
  const profileReference = rawReference && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawReference)
    ? rawReference : null;

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
    if (!result.ok && result.retryAfterSeconds) target.set("wait", String(result.retryAfterSeconds));
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
          <LocaleSwitcher locale={locale} englishLabel={tNav("english")} chineseLabel={tNav("chinese")} switchToEnglishLabel={tNav("switchToEnglish")} switchToChineseLabel={tNav("switchToChinese")}/>
        </header>
        <section aria-labelledby="login-heading" className="glass-card mx-auto max-w-xl p-6 sm:p-10">
          <h1 className="font-serif text-4xl font-semibold" id="login-heading">{t("formLabel")}</h1>
          <p className="mt-3 text-muted-foreground">{t("help")}</p>
          {resolution.kind === "needs-profile" ? <div className="mt-6" role="status">
            <p>{t("profileOnboarding")}</p>
            {queryValue(query.profile) === "conflict" ? <p className="mt-3 text-destructive" role="alert">{t("profileConflict")}</p> : null}
            {queryValue(query.profile) === "unverified" ? <p className="mt-3 text-destructive" role="alert">{t("profileUnverified")}</p> : null}
            {queryValue(query.profile) === "unavailable" ? <div className="mt-3 text-destructive" role="alert"><p>{t("profileUnavailable")}</p>{profileReference ? <p>{t("profileReference", {reference: profileReference})}</p> : null}</div> : null}
            <form action={provisionMemberProfileAction.bind(null, locale, profileContinuation ?? undefined)} data-testid="profile-provision-form">
              <button className="mt-4 min-h-11 rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t("createProfile")}</button>
            </form>
            <PortalSignOutButton errorLabel={t("switchAccountError")} label={t("switchAccount")}/>
          </div> : null}
          {resolution.kind === "forbidden" ? <div className="mt-5"><p className="text-destructive" role="alert">{t("memberAccessDenied")}</p><PortalSignOutButton errorLabel={t("switchAccountError")} label={t("switchAccount")}/></div> : null}
          {resolution.kind === "unavailable" ? <div className="mt-5" role="alert">
            <p>{t("identityUnavailable", {reference: resolution.reference})}</p>
            <a className="mt-3 inline-flex min-h-11 items-center underline" href={`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent(continuation)}`}>{t("retry")}</a>
          </div> : null}
          {resolution.kind === "signed-out" && errorKey ? <p className="mt-4 text-sm text-destructive" role="alert">{t(errorKey)}</p> : null}
          {resolution.kind === "signed-out" ? <SignInForm
            action={submitMemberLogin} destination={continuation} googleEnabled={process.env.AUTH_GOOGLE_ENABLED === "true"}
            intent="member" locale={locale} sent={sent} retryAfterSeconds={Math.min(3600, Math.max(0, Number(queryValue(query.wait)) || 0))}
            labels={{email: t("emailLabel"), send: t("submit"), resend: t("resend"), sending: t("sending"),
              google: t("google"), separator: t("separator"), changeEmail: t("changeEmail"), sent: t("sent"),
              googleUnavailable: t("googleUnavailable"), providerError: t("errors.auth"), maskedTo: t("maskedTo"), waitSeconds: t("waitSeconds")}}
          /> : null}
          {resolution.kind === "signed-out" ? <p className="mt-5 text-sm text-muted-foreground">{t("deliveryHelp")}</p> : null}
        </section>
      </div>
    </main>
  );
}
