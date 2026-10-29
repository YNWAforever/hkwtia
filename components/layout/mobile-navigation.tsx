"use client";

import {useRef, useState, useSyncExternalStore, type ComponentType} from "react";

import type {NavigationViewModel} from "@/config/navigation";
import {usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type MobileNavigationProps = {
  locale: AppLocale;
  navigation: NavigationViewModel;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    priority: string;
    utilities: string;
    exploreEcosystem: string;
    search: string;
    viewOverview: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
  brand: {homeLabel: string; publicName: string; descriptor: string; logoAlt: string};
};

type MobileNavPanelComponent = ComponentType<{
  locale: MobileNavigationProps["locale"];
  navigation: MobileNavigationProps["navigation"];
  labels: MobileNavigationProps["labels"];
  brand: MobileNavigationProps["brand"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expandedGroup: string;
  onExpandedGroupChange: (value: string) => void;
}>;

const subscribeToHydration = () => () => {};
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

// The closed menu is a button. Radix Dialog, Accordion and lucide stay in
// mobile-nav-panel.tsx and load on the first open, so a Lighthouse visit that
// never opens the menu does not evaluate them during first paint. The button
// stays disabled until hydration for the same reason as before: a click during
// the server HTML has no handler yet.
export function MobileNavigation({locale, navigation, labels, brand}: MobileNavigationProps) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const [Panel, setPanel] = useState<MobileNavPanelComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);

  /**
   * Every link in the sheet is wrapped in SheetClose; Back and Forward are navigations no click
   * reports. This menu is mounted by app/[locale]/(public)/layout.tsx, which survives them, and
   * Radix's Dialog closes on Escape, on an outside pointerdown and on its own close controls
   * only — neither its bundle nor DismissableLayer's names `popstate`, `hashchange` or
   * `window.history` — so the dialog stayed over the newly rendered page, taking its focus trap
   * and its scroll lock with it. Compared during render, the way the Concierge reads its
   * section (components/ai/concierge-widget.tsx:230-241): React re-runs this component before
   * committing, so no frame paints the stale dialog. Deliberately not `handleOpenChange`, which
   * also moves focus back to the trigger: a history navigation is not a close the reader asked
   * for, and Radix's own focus scope restores focus when the content unmounts.
   */
  const [renderedRoute, setRenderedRoute] = useState(pathname);
  if (renderedRoute !== pathname) {
    setRenderedRoute(pathname);
    setOpen(false);
    setExpandedGroup("");
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setExpandedGroup("");
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function openMenu() {
    if (Panel) {
      setOpen(true);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    void import("./mobile-nav-panel").then((mod) => {
      pending.current = false;
      setPanel(() => mod.MobileNavPanel);
      setOpen(true);
    }).catch(() => {
      pending.current = false;
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={!hydrated}
        className="mobile-trigger"
        aria-label={labels.open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={openMenu}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      {Panel ? (
        <Panel
          locale={locale}
          navigation={navigation}
          labels={labels}
          brand={brand}
          open={open}
          onOpenChange={handleOpenChange}
          expandedGroup={expandedGroup}
          onExpandedGroupChange={setExpandedGroup}
        />
      ) : null}
    </>
  );
}
