import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';
import {FAQ} from '@/components/marketing/faq';
import {PageHero} from '@/components/marketing/page-hero';
import {Section} from '@/components/marketing/section';
import {StructuredData} from '@/components/seo/structured-data';
import {TierComparison, type MembershipTier} from '@/components/marketing/tier-comparison';
import type {AppLocale} from '@/i18n/routing';
import {buildPageMetadata} from '@/lib/metadata';
import {buildFaqData} from '@/lib/structured-data';
type Props={params:Promise<{locale:string}>};
const tierIds=['community','individual','startup','corporate','platinum','patron'] as const;
export async function generateMetadata({params}:Props):Promise<Metadata>{const{locale}=await params;const t=await getTranslations({locale,namespace:'Membership'});return buildPageMetadata({locale:locale as AppLocale,pathname:'/membership',title:t('metaTitle'),description:t('metaDescription')});}
export default async function MembershipPage({params}:Props){const{locale}=await params;setRequestLocale(locale);const t=await getTranslations('Membership');const tiers:MembershipTier[]=tierIds.map((id)=>({id,name:t(`tiers.${id}.name`),price:t(`tiers.${id}.price`),cadence:t(`tiers.${id}.cadence`),description:t(`tiers.${id}.description`),benefits:[t('benefits.network'),t('benefits.programs'),t('benefits.visibility')],action:t('comingSoon')}));const faq=[0,1,2].map((i)=>({question:t(`faq.${i}.question`),answer:t(`faq.${i}.answer`)}));return <><StructuredData data={buildFaqData(faq)}/><PageHero eyebrow={t('eyebrow')} title={t('title')} description={t('summary')} /><Section heading={t('tiersTitle')} intro={t('tiersIntro')}><TierComparison tiers={tiers}/></Section><Section heading={t('faqTitle')}><FAQ items={faq}/></Section></>;}
