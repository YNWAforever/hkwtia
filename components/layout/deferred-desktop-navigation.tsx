"use client";

import {useEffect, useState, type ComponentProps} from "react";

import type {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";
import {cn} from "@/lib/utils";

type Props = ComponentProps<typeof DesktopMegaNavigation> & {locale: AppLocale};

/** The desktop menu is hidden through 1240px; do not hydrate Radix behind the mobile menu. */
export function DeferredDesktopNavigation({locale, ...props}: Props) {
  const [Navigation, setNavigation] = useState<typeof DesktopMegaNavigation | null>(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1241px)");
    let mounted = true;
    const load = () => {
      if (!media.matches) return;
      void import("./desktop-mega-navigation")
        .then((module) => { if (mounted) setNavigation(() => module.DesktopMegaNavigation); })
        .catch(() => {
          // Keep the server-rendered overview links usable if the menu chunk fails to load.
        });
    };
    load();
    media.addEventListener("change", load);
    return () => {
      mounted = false;
      media.removeEventListener("change", load);
    };
  }, []);

  if (Navigation) return <Navigation {...props} />;
  return (
    <nav className="desktop-nav" aria-label={props.primaryLabel}>
      {props.groups.map((group) => (
        <a key={group.id} className={cn("nav-button", group.eventFirst && "event-first")} href={localizedPath(locale, group.landingHref)}>
          {group.label} <span aria-hidden="true">⌄</span>
        </a>
      ))}
    </nav>
  );
}
