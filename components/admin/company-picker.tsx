"use client";
import { useEffect, useId, useRef, useState } from "react";
export type CompanyOption = Readonly<{ id: string; name: string }>;
export type CompanySearch = (
  search: string,
) => Promise<
  Readonly<
    { status: "success"; items: readonly CompanyOption[] } | { status: "error" }
  >
>;
export function CompanyPicker({
  value,
  options = [],
  search,
  labels,
  unavailable = false,
}: {
  value: string | null;
  unavailable?: boolean;
  options?: readonly CompanyOption[];
  search?: CompanySearch;
  labels: {
    company: string;
    empty: string;
    error: string;
    choose: string;
    searching: string;
  };
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    sequence = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [text, setText] = useState(
    options.find((item) => item.id === value)?.name ?? "",
  );
  const [selected, setSelected] = useState(value),
    [items, setItems] = useState(options),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [pending, setPending] = useState(false),
    [failed, setFailed] = useState(unavailable);
  useEffect(
    () => () => {
      sequence.current++;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function choose(item: CompanyOption) {
    sequence.current++;
    if (timer.current) clearTimeout(timer.current);
    setText(item.name);
    setSelected(item.id);
    setOpen(false);
    setPending(false);
    setFailed(false);
    input.current?.setCustomValidity("");
    input.current?.focus();
  }
  function change(next: string) {
    setText(next);
    setSelected(null);
    setOpen(true);
    setActive(-1);
    setFailed(false);
    input.current?.setCustomValidity(next.trim() ? labels.choose : "");
    const request = ++sequence.current;
    if (timer.current) clearTimeout(timer.current);
    if (!next.trim()) {
      setItems(options);
      setPending(false);
      return;
    }
    setItems([]);
    setPending(true);
    timer.current = setTimeout(async () => {
      try {
        const result = search
          ? await search(next)
          : { status: "error" as const };
        if (sequence.current !== request) return;
        setFailed(result.status === "error");
        setItems(result.status === "success" ? result.items : []);
      } catch {
        if (sequence.current === request) {
          setFailed(true);
          setItems([]);
        }
      } finally {
        if (sequence.current === request) setPending(false);
      }
    }, 150);
  }
  return (
    <div className="relative space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {labels.company}
      </label>
      <input
        ref={input}
        id={id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-options"}
        aria-activedescendant={
          open && active >= 0 ? id + "-option-" + active : undefined
        }
        className="min-h-11 w-full rounded-md border border-input bg-background px-3"
        value={text}
        onChange={(event) => change(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
              items.length === 0
                ? -1
                : event.key === "ArrowDown"
                  ? Math.min(index + 1, items.length - 1)
                  : Math.max(index - 1, 0),
            );
          } else if (event.key === "Enter" && open && items[active]) {
            event.preventDefault();
            choose(items[active]!);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      <input name="companyId" type="hidden" value={selected ?? ""} />
      {pending || failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          {pending ? labels.searching : labels.error}
        </p>
      ) : null}
      {
        <ul
          hidden={!open || pending || failed}
          id={id + "-options"}
          role="listbox"
          aria-label={labels.company}
          className="max-h-60 overflow-auto rounded-md border bg-background shadow-sm"
        >
          {items.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              {labels.empty}
            </li>
          ) : (
            items.map((item, index) => (
              <li
                role="option"
                aria-selected={active === index}
                id={id + "-option-" + index}
                key={item.id}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                >
                  {item.name}
                </button>
              </li>
            ))
          )}
        </ul>
      }
    </div>
  );
}
