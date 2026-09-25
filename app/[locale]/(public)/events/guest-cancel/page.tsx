import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {Link} from "@/i18n/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {robots: {index: false, follow: false}, referrer: "no-referrer"};

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<{token?: string | string[]}>;
}>;

export default async function GuestCancelPage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const token = typeof query.token === "string" ? query.token : "";
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{64}\.[0-9a-f]{64})$/.test(token)) notFound();
  const t = await getTranslations({locale, namespace: "Events"});
  return (
    <div className="container mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold">{t("guest.cancelConfirmTitle")}</h1>
      <p className="mt-4">{t("guest.cancelConfirmBody")}</p>
      <form action="/api/events/guest/cancel" className="mt-8" method="post">
        <input name="token" type="hidden" value={token} />
        <input name="locale" type="hidden" value={locale} />
        <button className="rounded bg-primary px-5 py-3 text-primary-foreground" type="submit">{t("guest.cancelConfirmAction")}</button>
      </form>
      <Link className="mt-6 inline-block underline" href="/events">{t("guest.cancelKeepLink")}</Link>
    </div>
  );
}
