export function EmptyState({title, description}: {title: string; description: string}) {
  return (
    <section className="glass-card p-6">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </section>
  );
}
