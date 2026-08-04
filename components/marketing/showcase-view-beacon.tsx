"use client";

import {useEffect} from "react";

export function ShowcaseViewBeacon({slug}: Readonly<{slug: string}>) {
  useEffect(() => {
    const path = `/api/showcase/${encodeURIComponent(slug)}/view`;
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(path);
      return;
    }
    void fetch(path, {keepalive: true, method: "GET"}).catch(() => undefined);
  }, [slug]);
  return null;
}
