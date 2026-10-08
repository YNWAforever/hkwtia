"use client";

import {useState} from "react";

/**
 * A checkbox group with a selection limit. Once `max` boxes are checked the unchecked ones are
 * disabled, so the member sees the limit before the server enforces it. Only unchecked boxes are
 * ever disabled by the limit: a company that already stores more than `max` tags (legacy data)
 * keeps every one of them checked, enabled and submitted, and can only remove tags, not add. The
 * counter is announced politely as it changes. Strings arrive translated; this calls no hooks.
 */
export function PortalTagPicker({name, legend, options, initial, max, readOnly, counterLabel}: Readonly<{name: string; legend: string; options: readonly {value: string; label: string}[]; initial: readonly string[]; max: number; readOnly: boolean; counterLabel: (count: number, max: number) => string}>) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(initial));
  const full = checked.size >= max;

  function toggle(value: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(value); else next.delete(value);
      return next;
    });
  }

  return (
    <fieldset className="portal-field portal-checks">
      <legend className="portal-field-label">{legend}</legend>
      {options.map((option) => {
        const isChecked = checked.has(option.value);
        return (
          <label key={option.value}>
            <input checked={isChecked} disabled={readOnly || (!isChecked && full)} name={name} onChange={(event) => toggle(option.value, event.target.checked)} type="checkbox" value={option.value} />
            <span>{option.label}</span>
          </label>
        );
      })}
      <p aria-live="polite" className="portal-checks-count">{counterLabel(checked.size, max)}</p>
    </fieldset>
  );
}
