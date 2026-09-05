export function InternalPageHeader({title, description}: Readonly<{title: string; description?: string}>) {
  return (
    <div className="mb-8 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
