import type {AppLocale} from "@/i18n/routing";
import {siteConfig} from "@/config/site";
import {clickToChatUrl} from "@/lib/whatsapp/click-to-chat";

type Props = Readonly<{
  locale: AppLocale;
  /** Page marker for lead attribution, e.g. "contact", "membership", "events". */
  source: string;
  label: string;
  prefill: string;
  className?: string;
}>;

/** Renders nothing until config/site.ts carries a WhatsApp number (programme D-4). */
export function WhatsAppLink({locale, source, label, prefill, className}: Props) {
  const href = clickToChatUrl({number: siteConfig.contact.whatsapp, text: `${prefill} [web:${source}:${locale}]`});
  if (!href) return null;
  return <a className={className} href={href} rel="noopener noreferrer" target="_blank">{label}</a>;
}
