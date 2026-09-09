"use client";

import {useId, useState} from "react";

export type HeroUploadLabels = Readonly<{choose: string; alt: string; upload: string; uploading: string; done: string; failed: string}>;

const inputClass = "mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3";

/**
 * Posts one image to the member-scoped upload route and hands the new media id
 * back to the form, which fills the hero field in. The alt text is sent for
 * both locales: a member writes one description, and an image without an
 * accessible name is refused by the registry. Failures stay generic on
 * purpose — the route answers 400/404/500 without detail, and a member who
 * cannot upload keeps every other field intact.
 */
export function HeroUpload({labels, onUploaded}: Readonly<{labels: HeroUploadLabels; onUploaded: (id: string) => void}>) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "failed">("idle");
  const statusId = useId();
  const ready = file !== null && alt.trim().length > 0;

  async function upload() {
    if (!file || !ready) return;
    setState("uploading");
    try {
      const description = alt.trim();
      const query = new URLSearchParams({filename: file.name, altEn: description, altZh: description, focalX: "50", focalY: "50"});
      const response = await fetch(`/api/portal/media/upload?${query.toString()}`, {method: "POST", body: file, headers: {"content-type": file.type}});
      if (!response.ok) { setState("failed"); return; }
      const body = (await response.json()) as {id?: unknown};
      if (typeof body.id !== "string") { setState("failed"); return; }
      onUploaded(body.id);
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4 text-sm sm:col-span-2">
      <label className="block font-medium">
        <span>{labels.choose}</span>
        <input accept="image/png,image/jpeg,image/webp" className="mt-2 block" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setState("idle"); }} type="file" />
      </label>
      <label className="block font-medium">
        <span>{labels.alt}</span>
        <input className={inputClass} maxLength={300} onChange={(event) => { setAlt(event.target.value); setState("idle"); }} type="text" value={alt} />
      </label>
      <button aria-describedby={statusId} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium disabled:opacity-60" disabled={state === "uploading" || !ready} onClick={upload} type="button">
        {state === "uploading" ? labels.uploading : labels.upload}
      </button>
      <p aria-live="polite" className={state === "failed" ? "text-destructive" : "text-muted-foreground"} id={statusId}>
        {state === "done" ? labels.done : state === "failed" ? labels.failed : ""}
      </p>
    </div>
  );
}
