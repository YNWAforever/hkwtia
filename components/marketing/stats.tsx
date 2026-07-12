export function Stats({items}: {items: readonly {value: string; label: string}[]}) {
  return <dl className="grid gap-6 sm:grid-cols-3">{items.map((item) => <div className="border-l-4 border-primary pl-5" key={item.label}><dt className="text-sm text-muted-foreground">{item.label}</dt><dd className="mt-1 text-3xl font-semibold">{item.value}</dd></div>)}</dl>;
}
