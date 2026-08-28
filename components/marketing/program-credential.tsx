import {MediaGallery} from '@/components/marketing/media-gallery';
import {StorySection} from '@/components/marketing/story-section';

/**
 * CPAI, which is a credential and not an event series.
 *
 * No editions, no winners, no funder — the shape difference is the point, and
 * it is why this is a separate component rather than program-editions.tsx with
 * everything optional. A page that can render an empty editions list is a page
 * that invites someone to ask when CPAI last ran, which the archive cannot say.
 *
 * The partner certificate is not decoration. WTIA issues CPAI alone and CUSCS
 * separately issues its own completion certificate to the same graduates —
 * 「一個課程，兩張認證」. A page naming only the issuer and the course partner
 * states half of that, which is the half the content audit got wrong when it
 * called CPAI a joint certification.
 */
type ProgramCredentialProps = {
  issuerHeading: string;
  issuer: string;
  coursePartnerHeading: string;
  coursePartner: string;
  partnerCertificateHeading: string;
  partnerCertificate: string;
  courseName: string;
  syllabusHeading: string;
  syllabus: readonly string[];
  images: readonly {src: string; alt: string}[];
};

export function ProgramCredential({
  issuerHeading,
  issuer,
  coursePartnerHeading,
  coursePartner,
  partnerCertificateHeading,
  partnerCertificate,
  courseName,
  syllabusHeading,
  syllabus,
  images
}: ProgramCredentialProps) {
  return (
    <StorySection heading={courseName} tone="plain">
      <div className="rounded-shell-lg bg-shell-warm p-6 sm:p-8">
        <dl className="mt-6 space-y-4">
          <Fact label={issuerHeading} value={issuer} />
          <Fact label={coursePartnerHeading} value={coursePartner} />
          <Fact label={partnerCertificateHeading} value={partnerCertificate} />
        </dl>
      </div>

      {syllabus.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-xl font-semibold">{syllabusHeading}</h3>
          <ul className="text-muted-foreground mt-4 list-disc space-y-2 pl-6">
            {syllabus.map((module) => (
              <li key={module}>{module}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-8">
          <MediaGallery images={images} />
        </div>
      ) : null}
    </StorySection>
  );
}

function Fact({label, value}: {label: string; value: string}) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
