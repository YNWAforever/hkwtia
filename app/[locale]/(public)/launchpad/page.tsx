import type {Metadata} from "next";
import {notFound} from "next/navigation";

type Props = {params: Promise<{locale: string}>};

// Hidden for this Preview. Both locales 404. The route stays in publicRoutes so
// announcement href checks do not need a migration, and it is omitted from the
// sitemap, nav, and footer. robots noindex covers any head that still ships.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  await params;
  return {robots: {index: false, follow: false}};
}

export default async function LaunchPadPage({params}: Props): Promise<never> {
  await params;
  notFound();
}
