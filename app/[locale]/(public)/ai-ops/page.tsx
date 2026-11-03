import type {Metadata} from "next";
import {notFound} from "next/navigation";

type Props = {params: Promise<{locale: string}>};

// Public KPIs (renewal targets, staff hours, LLM cost) stay off the site. A8, 2026-11-03.
// The route 404s and is omitted from the public nav and sitemap. No replacement metrics.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  void params;
  notFound();
}

export default async function AiOpsPage({params}: Props): Promise<never> {
  void params;
  notFound();
}
