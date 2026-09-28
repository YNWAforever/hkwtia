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
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useAdminUnsavedChanges() {
  return useContext(context);
}

export function GuardedAdminLink(props: ComponentProps<typeof Link>) {
  const {confirmLeave} = useAdminUnsavedChanges();
  return <Link {...props} onNavigate={(event) => {
    if (!confirmLeave()) {
      event.preventDefault();
      return;
    }
    props.onNavigate?.(event);
  }}/>;
}