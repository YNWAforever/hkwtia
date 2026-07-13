import {getTranslations} from 'next-intl/server';

import {Link} from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('NotFound');

  return (
    <main className="container mx-auto px-6 py-24">
      <h1 className="text-4xl font-semibold">{t('title')}</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">{t('description')}</p>
      <nav className="mt-8 flex gap-5">
        <Link className="font-semibold text-primary" href="/">{t('home')}</Link>
        <Link className="font-semibold text-primary" href="/contact">{t('contact')}</Link>
      </nav>
    </main>
  );
}
