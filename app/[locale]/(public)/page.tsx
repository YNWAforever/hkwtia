import {getTranslations, setRequestLocale} from "next-intl/server";

type HomePageProps = {params: Promise<{locale: string}>};

export default async function HomePage({params}: HomePageProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-24">
      <p className="mb-6 text-sm uppercase tracking-[0.3em] text-blue-700">
        {t("eyebrow")}
      </p>
      <h1 className="max-w-5xl text-5xl font-bold leading-none md:text-8xl">
        {t("title")}
      </h1>
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-600">
        {t("summary")}
      </p>
    </section>
  );
}
