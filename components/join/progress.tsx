import {cn} from "@/lib/utils";

export type JoinProgressStep = "plan" | "auth" | "profile" | "company";

export function JoinProgress({active, labels, showCompany}: {active: JoinProgressStep; labels: Record<JoinProgressStep, string>; showCompany: boolean}) {
  const steps: JoinProgressStep[] = showCompany ? ["plan", "auth", "profile", "company"] : ["plan", "auth", "profile"];
  const activeIndex = steps.indexOf(active);

  return (
    <nav aria-label={labels[active]} className="mb-8">
      <ol className="grid gap-3 sm:grid-cols-4">
        {steps.map((step, index) => (
          <li
            aria-current={step === active ? "step" : undefined}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              index <= activeIndex ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
            )}
            key={step}
          >
            {labels[step]}
          </li>
        ))}
      </ol>
    </nav>
  );
}
