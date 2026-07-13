import type {Event, FAQPage, Organization, WithContext} from 'schema-dts';

type StructuredDataProps = {
  data: WithContext<Organization | FAQPage | Event>;
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
