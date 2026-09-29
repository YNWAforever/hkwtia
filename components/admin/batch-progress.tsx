"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {z} from "zod";

import type {BatchItemState, BatchState} from "@/lib/admin/batches/types";

type Counters = Readonly<Record<BatchItemState, number>>;
type ProgressLabels = Readonly<{states: Record<string, string>; counters: Record<string, string>; unavailable: string}>;
const pollable = new Set<BatchState>(["preparing", "queued", "running"]);
const countersSchema = z.object({
  pending: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
}).strict();
const statusSchema = z.object({
  batchId: z.string().uuid(),
  state: z.enum(["preparing", "ready", "queued", "running", "completed", "completed_with_errors", "cancelled", "expired"]),
  counters: countersSchema,
}).strict();

/** Poll one owner-scoped status row. Refresh the detailed page once at a phase transition. */
export function BatchProgressPoller({batchId, state, counters, labels}: {batchId: string; state: BatchState; counters: Counters; labels: ProgressLabels}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<{baseState: BatchState; state: BatchState; counters: Counters} | null>(null);
  const [errorFor, setErrorFor] = useState<BatchState | null>(null);
  const current = snapshot?.baseState === state ? snapshot : {state, counters};

  useEffect(() => {
    if (!pollable.has(state)) return;
    let active = true;
    let busy = false;
    let done = false;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (busy || done) return;
      busy = true;
      try {
        const response = await fetch(`/api/admin/batches/${batchId}/status`, {cache: "no-store", credentials: "same-origin", signal: controller.signal});
        if (response.status === 404) {
          done = true;
          window.clearInterval(timer);
          if (active) router.refresh();
          return;
        }
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        const result = statusSchema.parse(await response.json());
        if (result.batchId !== batchId) throw new Error("STATUS_BATCH_MISMATCH");
        if (!active) return;
        setErrorFor(null);
        setSnapshot({baseState: state, ...result});
        if (!pollable.has(result.state)) {
          done = true;
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {
        if (active) setErrorFor(state);
      } finally {
        busy = false;
      }
    }, 5000);
    return () => {active = false; done = true; controller.abort(); window.clearInterval(timer);};
  }, [batchId, router, state]);

  const keys = ["pending", "running", "succeeded", "skipped", "failed"] as const;
  return <>
    <p className="font-medium" role="status">{labels.states[current.state] ?? current.state}</p>
    {errorFor === state ? <p className="text-sm text-muted-foreground" role="alert">{labels.unavailable}</p> : null}
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {keys.map(key => <div key={key}><dt>{labels.counters[key]}</dt><dd className="text-2xl font-semibold">{current.counters[key]}</dd></div>)}
    </dl>
  </>;
}