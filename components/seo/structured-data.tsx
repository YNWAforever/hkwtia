import type {Event, FAQPage, Organization, SoftwareApplication, WithContext} from 'schema-dts';

type StructuredDataProps = {
  data: WithContext<Organization | FAQPage | Event | SoftwareApplication>;
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
