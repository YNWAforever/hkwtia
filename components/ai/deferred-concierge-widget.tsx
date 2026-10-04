"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConciergeLauncher } from "./concierge-launcher";
import type { ConciergeWidget, ConciergeWidgetProps } from "./concierge-widget";
import { CONCIERGE_OPEN_EVENT } from "@/lib/ai/concierge-open";
import { localizedPath } from "@/lib/urls";

/** Keep the closed launcher cheap; load the existing dialog only after explicit intent. */
export function DeferredConciergeWidget(props: ConciergeWidgetProps) {
  const [Widget, setWidget] = useState<typeof ConciergeWidget | null>(null);
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
  const mounted = useRef(false),
    pending = useRef(false);
  const [initialInvoker, setInitialInvoker] = useState<HTMLElement | null>(
    null,
  );
  const open = useCallback(async () => {
    if (pending.current) return;
    const active = document.activeElement;
    setInitialInvoker(active instanceof HTMLElement ? active : null);
    pending.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const loaded = await import("./concierge-widget");
      if (mounted.current) setWidget(() => loaded.ConciergeWidget);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const request = () => {
      if (!Widget) void open();
    };
    window.addEventListener(CONCIERGE_OPEN_EVENT, request);
    return () => {
      mounted.current = false;
      window.removeEventListener(CONCIERGE_OPEN_EVENT, request);
    };
  }, [Widget, open]);
  if (Widget)
    return <Widget {...props} initialOpen initialInvoker={initialInvoker} />;
  return (
    <>
      <ConciergeLauncher label={props.labels.launcher}>
        <ConciergeLauncher.Button
          label={props.labels.launcher}
          aria-haspopup="dialog"
          aria-expanded={false}
          aria-busy={loading}
          onClick={(event) => {
            event.currentTarget.focus();
            void open();
          }}
        />
      </ConciergeLauncher>
      {failed ? (
        <div
          role="alert"
          className="fixed bottom-20 right-4 z-40 max-w-xs rounded-md border bg-background p-4 shadow-lg"
        >
          <p>{props.labels.temporarilyUnavailable}</p>
          <a
            className="block underline"
            href={localizedPath(props.locale, "/join")}
          >
            {props.labels.applicationGuide}
          </a>
          <a
            className="block underline"
            href={localizedPath(props.locale, "/contact")}
          >
            {props.labels.contactSupport}
          </a>
        </div>
      ) : null}
    </>
  );
}
