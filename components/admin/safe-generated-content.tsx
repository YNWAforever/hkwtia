export function SafeGeneratedContent(
  {content}: Readonly<{content: string}>,
) {
  return <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-sans text-sm leading-6 text-foreground">
    {content}
  </pre>;
}
