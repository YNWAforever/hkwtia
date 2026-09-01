import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {InstitutionalPageIntro} from "@/components/marketing/institutional-page-intro";
import {StorySection} from "@/components/marketing/story-section";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Committees"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/committees",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function CommitteesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Committees");
  const committees = ["executive", "innovation", "membership"] as const;

  return (
    <>
      <InstitutionalPageIntro eyebrow={t("eyebrow")} lead={t("summary")} title={t("title")} />
      <StorySection heading={t("structureTitle")} tone="plain">
        <div className="grid gap-6 md:grid-cols-3">
          {committees.map((committee) => (
            <article className="glass-card p-6" key={committee}>
              <h3 className="text-xl font-semibold">{t(`${committee}.title`)}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t(`${committee}.description`)}</p>
            </article>
          ))}
        </div>
      </StorySection>
    </>
  );
}
