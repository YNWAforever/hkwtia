export function InternalPageHeader({eyebrow, title, description}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
}>) {
  return (
    <header className="max-w-3xl space-y-3">
      {eyebrow
        ? <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        : null}
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {description ? <p className="text-lg text-muted-foreground">{description}</p> : null}
    </header>
  );
}
