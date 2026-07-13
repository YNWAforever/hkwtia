export type Feature = {title: string; description: string};

export function FeatureGrid({features}: {features: readonly Feature[]}) {
  return <div className="grid gap-6 md:grid-cols-3">{features.map((feature) => <article className="glass-card p-6" key={feature.title}><h3 className="text-xl font-semibold">{feature.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{feature.description}</p></article>)}</div>;
}
