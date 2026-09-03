import type {Event, FAQPage, Organization, SoftwareApplication, WebSite, WithContext} from 'schema-dts';

type StructuredDataProps = {
  data: WithContext<Organization | FAQPage | Event | SoftwareApplication | WebSite>;
};

export function StructuredData({data}: StructuredDataProps) {
  const serialized = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html: serialized}}
    />
  );
}
