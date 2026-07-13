import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {FeatureGrid} from '@/components/marketing/feature-grid';
import {PageHero} from '@/components/marketing/page-hero';
import {Section} from '@/components/marketing/section';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{locale}=await params;const t=await getTranslations({locale,namespace:'Committees'});return buildPageMetadata({locale:locale as AppLocale,pathname:'/about/committees',title:t('metaTitle'),description:t('metaDescription')});}
export default async function CommitteesPage({params}:Props){const{locale}=await params;setRequestLocale(locale);const t=await getTranslations('Committees');return <><PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('summary')} /><Section heading={t('structureTitle')}><FeatureGrid features={['executive','innovation','membership'].map((key)=>({title:t(`${key}.title`),description:t(`${key}.description`)}))}/></Section></>;}
