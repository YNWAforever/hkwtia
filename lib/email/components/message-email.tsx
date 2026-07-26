import {Button, Heading, Text} from "@react-email/components";

import type {AppLocale} from "@/i18n/routing";
import type {EmailCopy} from "@/lib/email/catalog";
import {EmailLayout} from "@/lib/email/components/email-layout";

type Props = Readonly<{
  locale: AppLocale;
  brand: string;
  copy: EmailCopy;
  ctaUrl: string;
  marketingFooter?: Readonly<{
    address: string;
    reason: string;
    unsubscribe: string;
    unsubscribeUrl: string;
  }>;
}>;

export function MessageEmail({locale, brand, copy, ctaUrl, marketingFooter}: Props) {
  return (
    <EmailLayout
      locale={locale}
      subject={copy.subject}
      preview={copy.preview}
      brand={brand}
      marketingFooter={marketingFooter}
    >
      <Heading as="h1" className="email-heading" style={{color: "#111827", fontSize: "28px", lineHeight: "36px", margin: "0 0 20px"}}>
        {copy.heading}
      </Heading>
      <Text className="email-copy" style={{color: "#374151", fontSize: "16px", lineHeight: "26px", margin: "0 0 28px"}}>
        {copy.body}
      </Text>
      <Button
        href={ctaUrl}
        style={{backgroundColor: "#2563eb", borderRadius: "8px", color: "#ffffff", display: "inline-block", fontSize: "15px", fontWeight: "700", padding: "12px 20px", textDecoration: "none"}}
      >
        {copy.cta}
      </Button>
    </EmailLayout>
  );
}
