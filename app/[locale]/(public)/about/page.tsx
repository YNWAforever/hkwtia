import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {FeatureGrid} from '@/components/marketing/feature-grid';
import {PageHero} from '@/components/marketing/page-hero';
import {Section} from '@/components/marketing/section';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};
export async function generateMetadata({params}: Props): Promise<Metadata> {const {locale}=await params; const t=await getTranslations({locale,namespace:'About'}); return buildPageMetadata({locale:locale as AppLocale,pathname:'/about',title:t('metaTitle'),description:t('metaDescription'),image:'/images/about-hero.jpg'});}
export default async function AboutPage({params}: Props) {const {locale}=await params; setRequestLocale(locale); const t=await getTranslations('About'); return <><PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('summary')} image="/images/about-hero.jpg" imageAlt={t('imageAlt')} /><Section heading={t('historyTitle')} intro={t('historyIntro')}><FeatureGrid features={['connect','advance','represent'].map((key)=>({title:t(`${key}.title`),description:t(`${key}.description`)}))} /></Section></>;}
