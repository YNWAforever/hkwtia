import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {AccessDenied} from "@/components/auth/access-denied";
import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
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

function errorKey(value: string | undefined): "errors.email" | "errors.invalidContinuation" | "errors.rateLimited" | "errors.auth" | null {
  switch (value) {
    case "invalid_email": return "errors.email";
    case "invalid_continuation": return "errors.invalidContinuation";
    case "rate_limited": return "errors.rateLimited";
    case "provider_error": return "errors.auth";
    default: return null;
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
  const actor = await getActor();
  if (actor?.kind === "staff" || actor?.kind === "superadmin") redirect(localizedPath(locale, destination));

  async function submitAdminLogin(formData: FormData): Promise<void> {
    "use server";
    const result = await requestAdminLoginLink({email: formData.get("email"), next: destination}, locale);
    const {redirect} = await import("next/navigation");
    const target = new URLSearchParams({next: destination});
    target.set(result.ok ? "sent" : "error", result.ok ? "1" : result.error);
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
      {actor
        ? <AccessDenied title={t("accessDenied")} copy={t("accessDeniedHelp")} home={t("home")} portal={t("memberPortal")}/>
        : <section aria-labelledby="admin-login-heading" className="glass-card mx-auto max-w-xl p-6 sm:p-10">
          <h1 className="font-serif text-4xl font-semibold" id="admin-login-heading">{t("title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("help")}</p>
          {scalar(query.sent) === "1" ? <p className="mt-4" role="status">{t("sent")}</p> : null}
          {errorKey(scalar(query.error)) ? <p className="mt-4 text-sm text-destructive" role="alert">{t(errorKey(scalar(query.error))!)}</p> : null}
          <form action={submitAdminLogin} className="mt-8" data-continuation={destination} data-testid="admin-login-form">
            <label className="mb-2 block text-sm font-medium" htmlFor="admin-email">{t("emailLabel")}</label>
            <input autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="admin-email" name="email" required type="email"/>
            <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t(scalar(query.sent) === "1" ? "resend" : "submit")}</button>
          </form>
          <p className="mt-5 text-sm text-muted-foreground">{t("deliveryHelp")}</p>
        </section>}
    </div>
  </main>;
}
