import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgramDetail} from '@/components/marketing/program-detail';
import {programs} from '@/content/programs';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};
const program = programs.find((item) => item.id === 'tct')!;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: program.namespace});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programs/tct', title: t('title'), description: t('description'), image: program.image});
}

export default async function TctPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: program.namespace});
  return <ProgramDetail program={program} title={t('title')} description={t('description')} status={t('status')} />;
}
