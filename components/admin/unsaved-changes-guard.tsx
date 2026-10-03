"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { PrivateLink as Link } from "@/components/internal-shell/private-link";

type UnsavedChanges = Readonly<{
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  confirmLeave: () => boolean;
  setScopedDirty?: (id: string, dirty: boolean) => void;
}>;
const context = createContext<UnsavedChanges>({
  dirty: false,
  setDirty: () => {},
  confirmLeave: () => true,
});

/** Shared across the admin shell and its forms; no client role or authorization state. */
export function AdminUnsavedChangesProvider({
  children,
  confirmMessage,
}: {
  children: ReactNode;
  confirmMessage: string;
}) {
  const [dirtySources, setDirtySources] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setScopedDirty = useCallback(
    (id: string, dirty: boolean) =>
      setDirtySources((previous) => {
        if (previous.has(id) === dirty) return previous;
        const next = new Set(previous);
        if (dirty) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const setDirty = useCallback(
    (dirty: boolean) => setScopedDirty("legacy", dirty),
    [setScopedDirty],
  );
  const dirty = dirtySources.size > 0;
  const confirmLeave = useCallback(
    () => !dirty || window.confirm(confirmMessage),
    [dirty, confirmMessage],
  );
  const value = useMemo(
    () => ({ dirty, setDirty, setScopedDirty, confirmLeave }),
    [dirty, setDirty, setScopedDirty, confirmLeave],
  );
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const directLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !anchor ||
        anchor.hasAttribute("data-unsaved-guarded") ||
        anchor.hasAttribute("download") ||
        (anchor.getAttribute("target") &&
          anchor.getAttribute("target") !== "_self")
      )
        return;
      const destination = new URL(
        anchor.getAttribute("href") ?? "",
        window.location.href,
      );
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (!confirmLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", directLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", directLink, true);
    };
  }, [dirty, confirmLeave]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useAdminUnsavedChanges() {
  const shared = useContext(context),
    id = useId();
  const { setScopedDirty, setDirty: legacySetDirty } = shared;
  const setDirty = useCallback(
    (dirty: boolean) =>
      setScopedDirty ? setScopedDirty(id, dirty) : legacySetDirty(dirty),
    [setScopedDirty, legacySetDirty, id],
  );
  useEffect(
    () => () => {
      setScopedDirty?.(id, false);
    },
    [setScopedDirty, id],
  );
  return useMemo(() => ({ ...shared, setDirty }), [shared, setDirty]);
}

export function GuardedAdminLink(props: ComponentProps<typeof Link>) {
  const { confirmLeave } = useAdminUnsavedChanges();
  // Private sidebar/topbar routes must not fan out authenticated reads on idle or hover.
  return (
    <Link
      {...props}
      prefetch={false}
      data-unsaved-guarded=""
      onNavigate={(event) => {
        if (!confirmLeave()) {
          event.preventDefault();
          return;
        }
        props.onNavigate?.(event);
      }}
    />
  );
}
