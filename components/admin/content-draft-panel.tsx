"use client";
import { useState, useTransition } from "react";
import { GuardedAdminLink } from "@/components/admin/unsaved-changes-guard";
import { localizedPath } from "@/lib/urls";
import type en from "@/messages/en.json";
import type { AiDraftDetails } from "@/lib/db/repos/ai-drafts";
import {
  prepareContentDraftAction,
  adoptContentDraftAction,
} from "@/lib/admin/content-draft-actions";
export type ContentAssistance = Readonly<{
  kind: "event" | "news";
  id: string;
  locale: "en" | "zh-HK";
  labels: typeof en.ContentAssistance;
  configured: boolean;
  enabled: boolean;
  unavailable?: boolean;
  drafts: Readonly<Record<"en" | "zh-HK", AiDraftDetails | null>>;
}>;
export function ContentDraftPanel({
  value,
  onAdopt,
  dirty,
}: Readonly<{
  value: ContentAssistance;
  onAdopt: (locale: "en" | "zh-HK", body: string) => boolean;
  dirty: boolean;
}>) {
  const [locale, setLocale] = useState<"en" | "zh-HK">(value.locale),
    [status, setStatus] = useState<string | null>(null),
    [newDraft, setNewDraft] = useState<Readonly<{
      id: string;
      locale: "en" | "zh-HK";
    }> | null>(null),
    [pending, start] = useTransition();
  const t = value.labels,
    draft = value.drafts[locale],
    ready =
      draft?.draft.state === "approved" &&
      draft.factsAvailable &&
      !draft.violations.length &&
      value.enabled;
  const target = { kind: value.kind, id: value.id, locale };
  function prepare() {
    if (dirty) {
      setStatus("dirty");
      return;
    }
    start(async () => {
      try {
        const result = await prepareContentDraftAction(target);
        setStatus(result.status);
        if (result.status === "created")
          setNewDraft({ id: result.draftId, locale });
      } catch {
        setStatus("unavailable");
      }
    });
  }
  function adopt() {
    if (!ready || !draft) return;
    if (dirty) {
      setStatus("dirty");
      return;
    }
    start(async () => {
      try {
        const result = await adoptContentDraftAction(target, {
          draftId: draft.draft.id,
          expectedVersion: draft.draft.version,
        });
        setStatus(result.status);
        if (result.status === "adopted" && !onAdopt(result.locale, result.body))
          setStatus("dirty");
      } catch {
        setStatus("unavailable");
      }
    });
  }
  const id = newDraft?.locale === locale ? newDraft.id : draft?.draft.id;
  const message =
    status && status in t
      ? t[status as keyof typeof t]
      : value.unavailable
        ? t.unavailable
        : !value.enabled
          ? t.disabled
          : !value.configured
            ? t.configuration
            : !draft
              ? t.noHistory
              : t.manual;
  return (
    <section
      aria-labelledby="content-assistance-title"
      className="min-w-0 space-y-4 rounded-lg border p-4 md:col-span-2"
    >
      <h2 id="content-assistance-title" className="text-xl font-semibold">
        {t.title}
      </h2>
      <p>{t.description}</p>
      <p role="status" className="break-words">
        {message}
      </p>
      <label className="block font-medium">
        {t.locale}
        <select
          className="mt-2 min-h-11 w-full rounded-md border p-2 sm:w-auto"
          value={locale}
          onChange={(event) => {
            setLocale(event.target.value as "en" | "zh-HK");
            setStatus(null);
          }}
        >
          <option value="en">{t.en}</option>
          <option value="zh-HK">{t.zhHK}</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={prepare}
          disabled={pending || dirty || !value.enabled || !value.configured}
          className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-60"
        >
          {pending ? t.preparing : t.prepare}
        </button>
        <GuardedAdminLink
          href={localizedPath(
            value.locale,
            "/admin/ai-review" +
              (id ? "?" + new URLSearchParams({ draft: id }) : ""),
          )}
          className="inline-flex min-h-11 items-center text-primary underline"
        >
          {t.review}
        </GuardedAdminLink>
        <button
          type="button"
          onClick={adopt}
          disabled={pending || dirty || !ready}
          className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-60"
        >
          {pending ? t.adopting : t.adopt}
        </button>
      </div>
    </section>
  );
}
