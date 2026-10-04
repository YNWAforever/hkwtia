"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminUnsavedChanges } from "@/components/admin/unsaved-changes-guard";
import {
  reviewAiDraftAction,
  editAiDraftAction,
  type DraftActionResult,
} from "@/lib/admin/ai-draft-actions";
import type { AiDraftDetails } from "@/lib/db/repos/ai-drafts";
import type en from "@/messages/en.json";
export type AiDraftReviewLabels = Readonly<{
  [K in keyof typeof en.AiDraftReview]: string;
}>;
export function AiReviewPanel({
  details,
  labels,
  enabled,
}: Readonly<{
  details: AiDraftDetails;
  labels: AiDraftReviewLabels;
  enabled: boolean;
}>) {
  const { draft } = details,
    router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState<DraftActionResult["status"] | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const { setDirty } = useAdminUnsavedChanges();
  const dirty = body !== draft.body;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const unavailable = !enabled || !details.factsAvailable;
  const ready =
    !unavailable &&
    !dirty &&
    !pending &&
    draft.state === "needs_review" &&
    details.violations.length === 0;
  function mutate(decision: "approve" | "reject" | "edit") {
    setStatus(null);
    startTransition(async () => {
      try {
        const result =
          decision === "edit"
            ? await editAiDraftAction({
                draftId: draft.id,
                expectedVersion: draft.version,
                body,
              })
            : await reviewAiDraftAction({
                draftId: draft.id,
                expectedVersion: draft.version,
                decision,
              });
        setStatus(result.status);
        if (result.status === "saved" || result.status === "stale") {
          setDirty(false);
          router.refresh();
        }
      } catch {
        setStatus("unavailable");
      }
    });
  }
  const factLabels = details.facts?.values ?? {};
  return (
    <section
      aria-labelledby={`ai-draft-${draft.id}`}
      className="min-w-0 space-y-5 rounded-2xl border border-border p-4 sm:p-6"
    >
      <header className="space-y-2">
        <h2 id={`ai-draft-${draft.id}`} className="text-xl font-semibold">
          {labels.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{labels.description}</p>
        <p>{labels[draft.state]}</p>
      </header>
      {unavailable || draft.state === "stale" ? (
        <p role="status" className="rounded-lg border border-border p-3">
          {draft.state === "stale"
            ? labels.stale
            : enabled
              ? labels.configuration
              : labels.disabled}{" "}
          <span>{labels.manualFallback}</span>
        </p>
      ) : null}
      <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        {[
          [labels.version, draft.version],
          [labels.owner, draft.ownerId ?? labels.noValue],
          [labels.due, draft.dueAt ?? labels.noValue],
          [labels.factsHash, draft.factsHash],
          [labels.model, draft.modelRoute],
          [labels.prompt, draft.promptVersion],
          [
            labels.cost,
            details.usageState === "known" && details.costMicrousd !== null
              ? details.costMicrousd
              : details.usageState === "not_dispatched"
                ? 0
                : labels.unknownCost,
          ],
          [
            labels.usage,
            labels[details.usageState as keyof AiDraftReviewLabels] ??
              labels.unverified,
          ],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {details.analysis?<div className="space-y-2"><h3 className="font-semibold">{labels.analysisSummary}</h3><p className="whitespace-pre-wrap break-words">{details.analysis.summary}</p><h3 className="font-semibold">{labels.analysisTasks}</h3><ul>{details.analysis.tasks.map((task,i)=><li key={i} className="break-words">{task}</li>)}</ul></div>:null}
      <div>
        <h3 className="font-semibold">{labels.facts}</h3>
        <dl>
          {Object.entries(factLabels).map(([field, fact]) => (
            <div key={field} className="my-2">
              <dt>{fact.label}</dt>
              <dd className="break-words">
                {String(fact.value ?? labels.noValue)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <details>
        <summary>{labels.references}</summary>
        {draft.sourceRefs.map((ref) => (
          <pre
            key={`${ref.sourceId}:${ref.version}:${ref.locale}`}
            className="my-3 whitespace-pre-wrap break-all text-xs"
          >
            {JSON.stringify(ref, null, 2)}
          </pre>
        ))}
      </details>
      <details>
        <summary>{labels.claims}</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(draft.claims, null, 2)}
        </pre>
      </details>
      {details.violations.length ? (
        <div role="alert">
          <h3>{labels.violations}</h3>
          <ul>
            {details.violations.map((item) => (
              <li key={`${item.field}:${item.code}`} className="break-all">
                {factLabels[item.field]?.label ?? labels.body}:{" "}
                {/^(FACTS_CHANGED|SOURCE_)/u.test(item.code)
                  ? labels.factsChanged
                  : /UNSAFE|EXECUTABLE|URL_/u.test(item.code)
                    ? labels.unsafeBody
                    : labels.unsupportedFact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold">{labels.previous}</h3>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-sm">
            {details.previousBody ?? labels.noValue}
          </pre>
        </div>
        <div>
          <h3 className="font-semibold">{labels.body}</h3>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-sm">
            {details.renderedBody || labels.noValue}
          </pre>
        </div>
      </div>
      <label htmlFor={`draft-body-${draft.id}`} className="block font-medium">
        {labels.template}
      </label>
      <textarea
        id={`draft-body-${draft.id}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={20000}
        rows={8}
        disabled={pending}
        className="w-full min-w-0 rounded-lg border border-input bg-background p-3 text-sm"
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!ready}
          onClick={() => mutate("approve")}
          className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {labels.approve}
        </button>
        <button
          type="button"
          disabled={
            unavailable ||
            dirty ||
            pending ||
            !["proposed", "needs_review"].includes(draft.state)
          }
          onClick={() => mutate("reject")}
          className="min-h-11 rounded-md border border-border px-4 py-2 disabled:opacity-50"
        >
          {labels.reject}
        </button>
        <button
          type="button"
          disabled={unavailable || !dirty || pending}
          onClick={() => mutate("edit")}
          className="min-h-11 rounded-md border border-border px-4 py-2 disabled:opacity-50"
        >
          {labels.save}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{labels.adoptSeparate}</p>
      {pending ? (
        <p role="status">{labels.pending}</p>
      ) : status ? (
        <p role={status === "saved" ? "status" : "alert"}>{labels[status]}</p>
      ) : null}
    </section>
  );
}
