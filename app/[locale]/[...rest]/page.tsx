import {notFound} from 'next/navigation';

// Every route outranks a catch-all, so this only receives URLs that match nothing (/terms,
// /zh/programs/nope). Without it those never entered the [locale] tree and Next served its bare
// built-in 404: English only, no header or footer, no <html lang>. notFound() here renders
// app/[locale]/not-found.tsx inside the locale layout instead, with the same 404 status.
export default function CatchAllNotFound() {
  notFound();
}
