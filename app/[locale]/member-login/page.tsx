import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

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
  const t = await getTranslations("MemberLogin");

  // Already-authenticated visitors get an honest access message, not a
  // second sign-in form and not any Portal data — we never distinguish
  // member/admin here, we just say this page isn't for them.
  const actor = await getActor().catch(() => null);
  if (actor) {
    return (
      <section className="glass-card p-6 sm:p-10">
        <h1 className="font-serif text-4xl font-semibold">{t("formLabel")}</h1>
        <p className="mt-4 text-muted-foreground">{t("nonMemberAccess")}</p>
      </section>
    );
  }

  // Fails open to /portal for a stale or tampered `next` — this page must
  // never surface an error to a visitor over an invalid continuation alone.
  const continuation = parsePortalContinuation(queryValue(query.next));
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
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t("formLabel")}</h1>
      {sent ? (
        <p className="mt-4 text-muted-foreground">{t("sent")}</p>
      ) : (
        <>
          {errorKey ? <p className="mt-4 text-sm text-destructive">{t(errorKey)}</p> : null}
          <div className="mt-8">
            <form action={submitMemberLogin} data-continuation={continuation} data-testid="member-login-form">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="email">{t("emailLabel")}</label>
                <input autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="email" name="email" required type="email"/>
              </div>
              <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground" type="submit">{t("submit")}</button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
