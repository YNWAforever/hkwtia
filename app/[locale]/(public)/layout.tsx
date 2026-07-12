import {getTranslations, setRequestLocale} from "next-intl/server";
import type {ReactNode} from "react";

type PublicLayoutProps = {
  children: ReactNode;
  params: Promise<{locale: string}>;
};

export default async function PublicLayout({children, params}: PublicLayoutProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Common");

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <main id="main-content">{children}</main>
    </>
  );
}
