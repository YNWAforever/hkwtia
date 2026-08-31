import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {InstitutionalPageIntro} from "@/components/marketing/institutional-page-intro";
import {StorySection} from "@/components/marketing/story-section";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "About"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about",
    title: t("metaTitle"),
    description: t("metaDescription"),
    image: "/images/about-hero.jpg",
  });
}

export default async function AboutPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");
  const roles = ["connect", "advance", "represent"] as const;

  return (
    <>
      <InstitutionalPageIntro
        eyebrow={t("eyebrow")}
        image="/images/about-hero.jpg"
        imageAlt={t("imageAlt")}
        lead={t("summary")}
        title={t("title")}
      />
      <StorySection heading={t("historyTitle")} intro={t("historyIntro")} tone="plain">
        <div className="grid gap-6 md:grid-cols-3">
          {roles.map((role) => (
            <article className="glass-card p-6" key={role}>
              <h3 className="text-xl font-semibold">{t(`${role}.title`)}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t(`${role}.description`)}</p>
            </article>
          ))}
        </div>
      </StorySection>
      <StorySection heading={t("foundedTitle")} intro={t("foundedBody")} tone="warm">
        <h3 className="text-xl font-semibold">{t("missionTitle")}</h3>
        <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">{t("missionBody")}</p>
        <Link className="mt-6 inline-block font-semibold text-primary" href="/about/history">
          {t("historyLink")}
        </Link>
      </StorySection>
    </>
  );
}
