import {Arrow} from "@/components/wt/arrow";
import type {AppLocale} from "@/i18n/routing";
import type {ShowcaseFilters} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

export type SolutionNeed = Readonly<{slug: string; label: string}>;

const CARRY_FORWARD_KEYS = ["category", "deployment", "language", "worksWith", "q"] as const;

// Additive alongside q (and every other active facet): each chip's own form carries forward
// every currently-set filter except useCase as hidden inputs, then sets useCase itself via its
// own hidden input rather than the submit button's own name/value pair -- a <button>'s own
// name/value attributes get reordered by React's HTML serializer regardless of JSX source order,
// while a plain hidden <input> keeps type/name/value in the order it was written.
// `className="contents"` keeps the real <button> as the `.solution-needs` grid item, matching
// the donor's tag-specific selector.
export function SolutionNeeds({locale, filters, chips}: Readonly<{locale: AppLocale; filters: ShowcaseFilters; chips: readonly SolutionNeed[]}>) {
  const action = localizedPath(locale, "/showcase");
  return <div className="solution-needs">
    {chips.map((chip, index) => {
      const active = filters.useCase === chip.slug;
      return (
        <form action={action} className="contents" key={chip.slug} method="get">
          {CARRY_FORWARD_KEYS.filter((key) => filters[key]).map((key) => (
            <input key={key} name={key} type="hidden" value={filters[key]} />
          ))}
          <input name="useCase" type="hidden" value={chip.slug} />
          <button aria-pressed={active} className={active ? "active" : undefined} type="submit">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span>{chip.label}</span>
            <Arrow />
          </button>
        </form>
      );
    })}
  </div>;
}
