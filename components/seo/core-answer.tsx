/**
 * One verified question and answer, already in the server HTML.
 * HOLD placeholders are not rendered through this component.
 */
type CoreAnswerProps = Readonly<{
  id: string;
  question: string;
  answer: string;
}>;

export function CoreAnswer({id, question, answer}: CoreAnswerProps) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="shell">
        <h2 className="text-2xl font-semibold" id={id}>{question}</h2>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed">{answer}</p>
      </div>
    </section>
  );
}
