import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StorySection} from "@/components/marketing/story-section";
import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
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
  const common = await getTranslations({locale, namespace: "Common"});
  // No compass grid here: a single unattributed message has nothing to link or count
  // (restraint, the same instinct HonestEmpty applies elsewhere -- don't manufacture a
  // 3-item grid for it).
  const related = await buildOtherAboutRoutes(locale as AppLocale, "chairman");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <StorySection heading={t("messageTitle")} tone="warm">
        <blockquote className="max-w-3xl border-l-4 border-primary pl-6 text-xl leading-relaxed">
          <p>{t("message")}</p>
          <footer className="mt-6 font-semibold">
            <cite className="not-italic">{t("signature")}</cite>
          </footer>
        </blockquote>
      </StorySection>
      <RichRelatedRoutes items={related} />
    </>
  );
}
