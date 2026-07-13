import {Link} from '@/i18n/navigation';

export function PreviewState({eyebrow, title, description, milestone, links}: {eyebrow: string; title: string; description: string; milestone: string; links: readonly {href: string; label: string}[]}) {
  return <section className="glass-card p-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold">{title}</h2><p className="mt-3 text-muted-foreground">{description}</p><p className="mt-5 text-sm font-medium">{milestone}</p><div className="mt-5 flex flex-wrap gap-4">{links.map((link) => <Link className="font-semibold text-primary" href={link.href} key={link.href}>{link.label}</Link>)}</div></section>;
}
