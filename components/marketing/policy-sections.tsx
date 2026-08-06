export type PolicySection = Readonly<{
  heading: string;
  body: readonly string[];
  items: readonly string[];
}>;

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

/**
 * Normalizes the untyped `t.raw()` payload so a malformed or partially
 * translated message bundle renders what it can instead of throwing on a
 * public page.
 */
export function parsePolicySections(value: unknown): readonly PolicySection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const {heading, body, items} = entry as Record<string, unknown>;
    if (typeof heading !== "string" || heading.length === 0) return [];
    return [{heading, body: stringList(body), items: stringList(items)}];
  });
}

export function PolicySections(
  {sections}: Readonly<{sections: readonly PolicySection[]}>,
) {
  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-6 py-16">
      {sections.map((section) => (
        <section className="glass-card space-y-4 p-6" key={section.heading}>
          <h2 className="font-serif text-2xl font-semibold">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p className="leading-relaxed text-muted-foreground" key={paragraph}>
              {paragraph}
            </p>
          ))}
          {section.items.length > 0 ? (
            <ul className="list-disc space-y-2 pl-6 leading-relaxed text-muted-foreground">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
