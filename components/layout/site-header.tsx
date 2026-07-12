import Image from 'next/image';
import {getTranslations} from 'next-intl/server';

import {LocaleSwitcher} from '@/components/layout/locale-switcher';
import {MobileNavigation} from '@/components/layout/mobile-navigation';
import {Button} from '@/components/ui/button';
import {navigationItems} from '@/config/navigation';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

export async function SiteHeader({locale}: {locale: AppLocale}) {
  const t = await getTranslations({locale, namespace: 'Navigation'});
  const items = navigationItems.map((item) => ({...item, label: t(item.labelKey)}));
  const labels = {
    open: t('openMenu'), close: t('closeMenu'), title: t('menuTitle'),
    description: t('menuDescription'), join: t('join'), english: t('english'),
    chinese: t('chinese'), switchToEnglish: t('switchToEnglish'),
    switchToChinese: t('switchToChinese')
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <Link href="/" aria-label={t('homeLabel')}>
          <Image src="/images/wtia-logo.png" alt={t('logoAlt')} width={150} height={58} priority className="h-10 w-auto" />
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label={t('primaryLabel')}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <LocaleSwitcher locale={locale} englishLabel={labels.english} chineseLabel={labels.chinese} switchToEnglishLabel={labels.switchToEnglish} switchToChineseLabel={labels.switchToChinese} />
          <Button asChild size="sm" className="rounded-full px-5">
            <Link href="/membership">{labels.join}</Link>
          </Button>
        </nav>
        <MobileNavigation locale={locale} items={items} labels={labels} />
      </div>
    </header>
  );
}
