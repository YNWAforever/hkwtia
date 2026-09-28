"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentProps, type ReactNode} from "react";
import Link from "next/link";

type UnsavedChanges = Readonly<{dirty: boolean; setDirty: (dirty: boolean) => void; confirmLeave: () => boolean}>;
const context = createContext<UnsavedChanges>({dirty: false, setDirty: () => {}, confirmLeave: () => true});

/** Shared across the admin shell and its forms; no client role or authorization state. */
export function AdminUnsavedChangesProvider({children, confirmMessage}: {children: ReactNode; confirmMessage: string}) {
  const [dirty, setDirty] = useState(false);
  const confirmLeave = useCallback(() => !dirty || window.confirm(confirmMessage), [dirty, confirmMessage]);
  const value = useMemo(() => ({dirty, setDirty, confirmLeave}), [dirty, confirmLeave]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const directLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.hasAttribute("data-unsaved-guarded") || anchor.hasAttribute("download") || (anchor.getAttribute("target") && anchor.getAttribute("target") !== "_self")) return;
      const destination = new URL(anchor.getAttribute("href") ?? "", window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
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
  return useContext(context);
}

export function GuardedAdminLink(props: ComponentProps<typeof Link>) {
  const {confirmLeave} = useAdminUnsavedChanges();
  return <Link {...props} data-unsaved-guarded="" onNavigate={(event) => {
    if (!confirmLeave()) {
      event.preventDefault();
      return;
    }
    props.onNavigate?.(event);
  }}/>;
}