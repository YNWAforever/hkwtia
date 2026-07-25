import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";

type MarketingFooter = Readonly<{
  address: string;
  reason: string;
  unsubscribe: string;
  unsubscribeUrl: string;
}>;

type Props = Readonly<{
  locale: AppLocale;
  subject: string;
  preview: string;
  brand: string;
  children: ReactNode;
  marketingFooter?: MarketingFooter;
}>;

const pageStyle = {
  backgroundColor: "#f3f4f6",
  color: "#111827",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: "0",
  padding: "24px 0",
};

const containerStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "32px",
};

export function EmailLayout({
  locale,
  subject,
  preview,
  brand,
  children,
  marketingFooter,
}: Props) {
  return (
    <Html lang={locale}>
      <Head>
        <title>{subject}</title>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{`
          @media (prefers-color-scheme: dark) {
            .email-page { background-color: #0f172a !important; color: #f8fafc !important; }
            .email-card { background-color: #111827 !important; border-color: #334155 !important; color: #f8fafc !important; }
            .email-heading { color: #f8fafc !important; }
            .email-copy { color: #e2e8f0 !important; }
            .email-muted { color: #cbd5e1 !important; }
            .email-link { color: #93c5fd !important; }
          }
        `}</style>
      </Head>
      <Preview className="email-preheader">{preview}</Preview>
      <Body className="email-page" style={pageStyle}>
        <Container className="email-card" style={containerStyle}>
          <Text style={{color: "#2563eb", fontSize: "13px", fontWeight: "700", letterSpacing: "0.08em", margin: "0 0 24px", textTransform: "uppercase"}}>
            {brand}
          </Text>
          {children}
          {marketingFooter ? (
            <Section aria-label="Marketing email preferences">
              <Hr style={{borderColor: "#e5e7eb", margin: "32px 0 20px"}} />
              <Text className="email-muted" style={{color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "0 0 8px"}}>
                {marketingFooter.reason}
              </Text>
              <Text className="email-muted" style={{color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "0 0 8px"}}>
                {marketingFooter.address}
              </Text>
              <Link className="email-link" href={marketingFooter.unsubscribeUrl} style={{color: "#2563eb", fontSize: "12px", textDecoration: "underline"}}>
                {marketingFooter.unsubscribe}
              </Link>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
