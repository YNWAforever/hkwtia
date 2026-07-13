import Image from 'next/image';

import {programs} from '@/content/programs';
import {Link} from '@/i18n/navigation';

export function ProgramGrid({labels, viewLabel}: {labels: Record<string, {title: string; description: string}>; viewLabel: string}) {
  return <div className="grid gap-6 sm:grid-cols-2">{programs.map((program) => <article className="overflow-hidden rounded-lg border bg-card" key={program.id}><Image src={program.image} alt="" width={800} height={450} className="aspect-video w-full object-cover" /><div className="p-6"><h3 className="text-2xl font-semibold">{labels[program.id].title}</h3><p className="mt-3 text-muted-foreground">{labels[program.id].description}</p><Link className="mt-5 inline-block font-semibold text-primary" href={`/programs/${program.id}`}>{viewLabel}</Link></div></article>)}</div>;
}
