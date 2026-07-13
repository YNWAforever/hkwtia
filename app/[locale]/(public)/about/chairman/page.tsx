import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {PageHero} from '@/components/marketing/page-hero';
import {Section} from '@/components/marketing/section';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{locale}=await params;const t=await getTranslations({locale,namespace:'Chairman'});return buildPageMetadata({locale:locale as AppLocale,pathname:'/about/chairman',title:t('metaTitle'),description:t('metaDescription')});}
export default async function ChairmanPage({params}:Props){const{locale}=await params;setRequestLocale(locale);const t=await getTranslations('Chairman');return <><PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('summary')} /><Section heading={t('messageTitle')}><blockquote className="max-w-3xl border-l-4 border-primary pl-6 text-xl leading-relaxed">{t('message')}</blockquote><p className="mt-6 font-semibold">{t('signature')}</p></Section></>;}
