import type {ProgramRecord} from '@/content/schemas';
import {InstitutionalPageIntro} from '@/components/marketing/institutional-page-intro';
import {StorySection} from '@/components/marketing/story-section';

type ProgramDetailProps = {
  program: ProgramRecord;
  title: string;
  description: string;
  statusHeading: string;
  status: string;
};

export function ProgramDetail({program, title, description, statusHeading, status}: ProgramDetailProps) {
  return (
    <>
      <InstitutionalPageIntro
        eyebrow={program.id.toUpperCase()}
        title={title}
        lead={description}
        image={program.image}
        imageAlt=""
      />
      <StorySection heading={statusHeading} tone="warm">
        <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{status}</p>
      </StorySection>
    </>
  );
}
