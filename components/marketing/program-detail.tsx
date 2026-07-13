import Image from 'next/image';

import type {ProgramRecord} from '@/content/schemas';
import {PageHero} from '@/components/marketing/page-hero';

type ProgramDetailProps = {
  program: ProgramRecord;
  title: string;
  description: string;
  status: string;
};

export function ProgramDetail({program, title, description, status}: ProgramDetailProps) {
  return (
    <>
      <PageHero
        eyebrow={program.id.toUpperCase()}
        title={title}
        description={description}
        image={program.image}
        imageAlt=""
      />
      <section className="container mx-auto px-6 py-16">
        <div className="glass-card p-6">
          <Image src={program.image} alt="" width={800} height={450} className="sr-only" />
          <p className="text-muted-foreground">{status}</p>
        </div>
      </section>
    </>
  );
}
