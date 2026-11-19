import {MediaGallery} from '@/components/marketing/media-gallery';
import {StorySection} from '@/components/marketing/story-section';

/**
 * CPAI course block. No editions and no issuer: who issues the credential is
 * not established, and an empty issuer row would still look like a fact.
 *
 * The only certificate row is an application condition. It must not be wired
 * back up as something graduates receive automatically. The course partner is
 * not a prop. Rendering the school here would need a promotional-name
 * approval this block does not have, and a "delivered with" label would read
 * as a claim that the partner teaches the course.
 */
type ProgramCredentialProps = {
  completionHeading: string;
  completionTerms: string;
  courseName: string;
  syllabusHeading: string;
  syllabus: readonly string[];
  images: readonly {src: string; alt: string}[];
};

export function ProgramCredential({
  completionHeading,
  completionTerms,
  courseName,
  syllabusHeading,
  syllabus,
  images
}: ProgramCredentialProps) {
  return (
    <StorySection heading={courseName} tone="plain">
      <div className="rounded-shell-lg bg-shell-warm p-6 sm:p-8">
        <dl className="space-y-4">
          <Fact label={completionHeading} value={completionTerms} />
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
