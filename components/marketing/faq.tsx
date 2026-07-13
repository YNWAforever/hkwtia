export function FAQ({items}: {items: readonly {question: string; answer: string}[]}) {
  return <div className="divide-y rounded-lg border">{items.map((item) => <details className="group p-5" key={item.question}><summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.question}</summary><p className="mt-3 leading-relaxed text-muted-foreground">{item.answer}</p></details>)}</div>;
}
