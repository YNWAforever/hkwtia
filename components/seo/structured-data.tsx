import type {BreadcrumbList, Event, FAQPage, Organization, SoftwareApplication, WebSite, WithContext} from 'schema-dts';

type StructuredDataProps = {
  // BreadcrumbList joined the union for the member pages (D-11): the trail is the only structured
  // data on the site that describes where a page sits rather than what it is about.
  data: WithContext<Organization | FAQPage | Event | SoftwareApplication | WebSite | BreadcrumbList>;
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
