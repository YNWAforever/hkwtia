import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {Arrow} from "@/components/wt/arrow";
import {Eyebrow} from "@/components/wt/eyebrow";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
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
  const common = await getTranslations({locale, namespace: "Common"});
  const history = await getTranslations({locale, namespace: "History"});
  const chairman = await getTranslations({locale, namespace: "Chairman"});
  const committees = await getTranslations({locale, namespace: "Committees"});
  const roles = ["connect", "advance", "represent"] as const;
  const related = await buildOtherAboutRoutes(locale as AppLocale, "about");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        image={{src: "/images/about-hero.jpg", alt: t("imageAlt")}}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: history("eyebrow"), value: history("title"), href: "/about/history"},
          {label: chairman("eyebrow"), value: chairman("title"), href: "/about/chairman"},
          {label: committees("eyebrow"), value: committees("title"), href: "/about/committees"},
        ]}
      />
      <Section labelledBy="about-role-title">
        <SectionHeading eyebrow={t("historyTitle")} title={t("historyIntro")} headingId="about-role-title" />
        <div className="rich-items rich-items-cards">
          {roles.map((role, index) => (
            <article key={role}>
              <span className="rich-item-number">{String(index + 1).padStart(2, "0")}</span>
              <h3>{t(`${role}.title`)}</h3>
              <p>{t(`${role}.description`)}</p>
            </article>
          ))}
        </div>
      </Section>
      <section aria-labelledby="about-manifesto-title" className="manifesto">
        <div className="shell manifesto-grid">
          <div>
            <Eyebrow light>{t("missionTitle")}</Eyebrow>
            <h2 id="about-manifesto-title">{t("missionBody")}</h2>
          </div>
          <div className="manifesto-copy">
            <h3>{t("foundedTitle")}</h3>
            <p>{t("foundedBody")}</p>
            <Link className="text-link light-link" href="/about/history">
              {t("historyLink")} <Arrow />
            </Link>
          </div>
        </div>
      </section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
