import {notFound} from 'next/navigation';

// Every route outranks a catch-all, so this only receives URLs that match nothing (/terms,
// /zh/programs/nope). Without it those never entered the [locale] tree and Next served its bare
// built-in 404: English only, no header or footer, no <html lang>. notFound() here renders
// app/[locale]/(public)/not-found.tsx inside the public layout instead — header, footer and
// translated copy, the same page /events/<missing> shows — with the same 404 status. It lives in
// (public), not directly under [locale], because only this group's layout draws the site chrome.
export default function CatchAllNotFound() {
  notFound();
}
