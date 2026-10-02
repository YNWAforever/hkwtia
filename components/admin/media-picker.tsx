"use client";
import Image from "next/image";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  isPrivateMediaDeliveryUrl,
  isRegistrableMediaUrl,
} from "@/lib/media/url";
export type RegisteredMediaOption = Readonly<{
  id: string;
  altEn: string;
  altZh: string;
  url?: string;
  contentType?: string | null;
  originalFilename?: string | null;
}>;
export function MediaPicker({
  rows,
  value,
  name,
  labels,
  invalid,
  errorId,
}: Readonly<{
  rows: readonly RegisteredMediaOption[];
  value: string;
  name: string;
  labels: Readonly<{
    choose: string;
    none: string;
    search: string;
    results: string;
    selected: string;
  }>;
  invalid?: boolean;
  errorId?: string;
}>) {
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(value);
  // React actions reset forms after success. Keep native reset defaults aligned
  // with the controlled registered selection without remounting/focus loss.
  useLayoutEffect(() => {
    for (const option of Array.from(selectRef.current?.options ?? [])) {
      option.defaultSelected = option.value === selected;
    }
  }, [selected, query, rows]);
  const q = query.trim().toLocaleLowerCase();
  const matching = rows.filter(
    (row) =>
      !q ||
      [
        row.altEn,
        row.altZh,
        row.originalFilename,
        row.contentType,
        row.url,
      ].some((text) => text?.toLocaleLowerCase().includes(q)),
  );
  const current = rows.find((row) => row.id === selected);
  const options =
    current && !matching.includes(current) ? [current, ...matching] : matching;
  const safeImage =
    current?.url &&
    (isRegistrableMediaUrl(current.url) ||
      isPrivateMediaDeliveryUrl(current.url))
      ? current.url
      : null;
  return (
    <fieldset className="space-y-3 rounded-md border p-4">
      <label className="block text-sm" htmlFor={id + "-search"}>
        {labels.search}
        <input
          id={id + "-search"}
          className="mt-1 min-h-11 w-full rounded-md border p-2"
          type="search"
          value={query}
          onInput={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            setQuery(event.target.value);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground" role="status">
        {labels.results}: {matching.length}
      </p>
      <label className="block" htmlFor={id + "-select"}>
        {labels.choose}
        <select
          ref={selectRef}
          id={id + "-select"}
          className="mt-1 min-h-11 w-full rounded-md border p-2"
          name={name}
          value={selected}
          aria-invalid={invalid}
          aria-describedby={errorId}
          // Native selects emit input before change. Let change commit the value
          // before the parent's dirty-state rerender can restore the old selection.
          onInput={(event) => event.stopPropagation()}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{labels.none}</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {row.altEn} / {row.altZh}
            </option>
          ))}
        </select>
      </label>
      {current ? (
        <div className="flex items-center gap-3">
          <div>
            {safeImage ? (
              <Image
                alt={current.altEn}
                src={safeImage}
                width={80}
                height={80}
                className="h-20 w-20 object-contain"
                unoptimized={isPrivateMediaDeliveryUrl(safeImage)}
              />
            ) : null}
          </div>
          <p className="min-w-0 break-words text-sm">
            {labels.selected}: {current.altEn} / {current.altZh}
            {current.contentType ? (
              <span className="block text-xs">{current.contentType}</span>
            ) : null}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
