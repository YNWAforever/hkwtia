import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {AccessDenied} from "@/components/auth/access-denied";
import {SignInForm} from "@/components/auth/sign-in-form";
import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {resolveCurrentLogin} from "@/lib/auth/login-resolution-server";
import {parseLoginDestination} from "@/lib/auth/login-destination";
import {localizedPath} from "@/lib/urls";
import {requestAdminLoginLink} from "@/app/[locale]/member-login/actions";

export const metadata: Metadata = {robots: {index: false, follow: false}};
export const dynamic = "force-dynamic";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorKey(value: string | undefined): "errors.email" | "errors.invalidContinuation" | "errors.rateLimited" | "errors.limiterUnavailable" | "errors.auth" | null {
  switch (value) {
    case "invalid_email": return "errors.email";
    case "invalid_continuation": return "errors.invalidContinuation";
    case "rate_limited": return "errors.rateLimited";
    case "limiter_unavailable": return "errors.limiterUnavailable";
    case "provider_error": return "errors.auth";
    default: return value ? "errors.auth" : null;
  }
}

export default async function AdminLoginPage({params, searchParams}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  const query = await searchParams;
  const destination = parseLoginDestination(scalar(query.next), "admin").path;
  const [t, tNav] = await Promise.all([
    getTranslations({locale, namespace: "AdminLogin"}),
    getTranslations({locale, namespace: "Navigation"}),
  ]);
  const resolution = await resolveCurrentLogin({intent: "admin", path: destination});
  if (resolution.kind === "allowed") redirect(localizedPath(locale, resolution.destination.path));

  async function submitAdminLogin(formData: FormData): Promise<void> {
    "use server";
    const result = await requestAdminLoginLink({email: formData.get("email"), next: destination}, locale);
    const {redirect} = await import("next/navigation");
    const target = new URLSearchParams({next: destination});
    target.set(result.ok ? "sent" : "error", result.ok ? "1" : result.error);
    if (!result.ok && result.retryAfterSeconds) target.set("wait", String(result.retryAfterSeconds));
    redirect(`${localizedPath(locale, "/admin-login")}?${target.toString()}`);
  }

  return <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link aria-label={tNav("homeLabel")} className="inline-flex min-h-11 items-center gap-3" href="/">
          <Image alt={tNav("logoAlt")} height={40} src="/images/wtia-logo.png" width={112}/>
          <span className="text-lg font-semibold text-primary">{tNav("brand.publicName")}</span>
        </Link>
        <nav aria-label={t("navigation")} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link className="min-h-11 content-center underline-offset-4 hover:underline" href="/">{t("home")}</Link>
          <Link className="min-h-11 content-center underline-offset-4 hover:underline" href="/member-login">{t("memberSignIn")}</Link>
          <a className="min-h-11 content-center underline-offset-4 hover:underline" href={`mailto:${siteConfig.contact.email}`}>{t("support")}</a>
        </nav>
      </header>
      {resolution.kind === "forbidden"
        ? <AccessDenied title={t("accessDenied")} copy={t("accessDeniedHelp")} home={t("home")} portal={t("memberPortal")}/>
        : resolution.kind === "needs-profile" ? <section className="glass-card mx-auto max-w-xl p-6 sm:p-10" role="alert">
          <h1 className="font-serif text-3xl">{t("profileRecovery")}</h1>
          <p className="mt-3">{t("profileRecoveryHelp")}</p>
          <Link className="mt-4 inline-flex min-h-11 items-center underline" href="/member-login">{t("memberSignIn")}</Link>
        </section>
        : resolution.kind === "unavailable" ? <section className="glass-card mx-auto max-w-xl p-6 sm:p-10" role="alert">
          <h1 className="font-serif text-3xl">{t("identityUnavailable", {reference: resolution.reference})}</h1>
          <a className="mt-4 inline-flex min-h-11 items-center underline" href={`${localizedPath(locale, "/admin-login")}?next=${encodeURIComponent(destination)}`}>{t("retry")}</a>
        </section>
        : <section aria-labelledby="admin-login-heading" className="glass-card mx-auto max-w-xl p-6 sm:p-10">
          <h1 className="font-serif text-4xl font-semibold" id="admin-login-heading">{t("title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("help")}</p>
          {errorKey(scalar(query.error)) ? <p className="mt-4 text-sm text-destructive" role="alert">{t(errorKey(scalar(query.error))!)}</p> : null}
          <SignInForm action={submitAdminLogin} destination={destination} googleEnabled={process.env.AUTH_GOOGLE_ENABLED === "true"}
            intent="admin" locale={locale} sent={scalar(query.sent) === "1"} retryAfterSeconds={Math.min(3600, Math.max(0, Number(scalar(query.wait)) || 0))}
            labels={{email: t("emailLabel"), send: t("submit"), resend: t("resend"), sending: t("sending"),
              google: t("google"), separator: t("separator"), changeEmail: t("changeEmail"), sent: t("sent"),
              googleUnavailable: t("googleUnavailable"), providerError: t("errors.auth"), maskedTo: t("maskedTo"), waitSeconds: t("waitSeconds")}}/>
          <p className="mt-5 text-sm text-muted-foreground">{t("deliveryHelp")}</p>
        </section>}
    </div>
  </main>;
}
