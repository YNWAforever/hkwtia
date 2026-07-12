'use client';

import {useTranslations} from 'next-intl';

type ErrorProps = {
  error: Error & {digest?: string};
  reset: () => void;
};

export default function ErrorPage({error, reset}: ErrorProps) {
  void error;
  const t = useTranslations('Error');

  return (
    <main className="container mx-auto px-6 py-24">
      <h1 className="text-4xl font-semibold">{t('title')}</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">{t('description')}</p>
      <button className="mt-8 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground" type="button" onClick={reset}>{t('retry')}</button>
    </main>
  );
}
