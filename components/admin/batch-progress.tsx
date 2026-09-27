"use client";

import {useEffect} from "react";
import {useRouter} from "next/navigation";

import type {BatchState} from "@/lib/admin/batches/types";

/** Refresh only while preparation or execution can change the persisted progress. */
export function BatchProgressPoller({state}: {state: BatchState}) {
  const router = useRouter();
  useEffect(() => {
    if (!["preparing", "queued", "running"].includes(state)) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [router, state]);
  return null;
}
