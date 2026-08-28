import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {InstitutionalPageIntro} from "@/components/marketing/institutional-page-intro";
import {StorySection} from "@/components/marketing/story-section";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Chairman"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/chairman",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function ChairmanPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Chairman");

  return (
    <>
      <InstitutionalPageIntro eyebrow={t("eyebrow")} lead={t("summary")} title={t("title")} />
      <StorySection heading={t("messageTitle")} tone="warm">
        <blockquote className="max-w-3xl border-l-4 border-primary pl-6 text-xl leading-relaxed">
          <p>{t("message")}</p>
          <footer className="mt-6 font-semibold">
            <cite className="not-italic">{t("signature")}</cite>
          </footer>
        </blockquote>
      </StorySection>
    </>
  );
}
