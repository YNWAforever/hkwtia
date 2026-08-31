"use client";

import {useRouter} from "next/navigation";
import {useRef, useState, type FormEvent} from "react";

type Labels = Readonly<{
  title: string;
  description: string;
  file: string;
  fileHelp: string;
  altEn: string;
  altZh: string;
  altHelp: string;
  focalX: string;
  focalY: string;
  upload: string;
  uploading: string;
  success: string;
  invalid: string;
  error: string;
}>;

const MAX_MEDIA_BYTES = 4_194_304;

const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

export function MediaUploadForm({labels}: Readonly<{labels: Labels}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [altEn, setAltEn] = useState("");
  const [altZh, setAltZh] = useState("");
  const [focalX, setFocalX] = useState("50");
  const [focalY, setFocalY] = useState("50");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || file.size < 1 || file.size > MAX_MEDIA_BYTES) {
      setStatus("error");
      setMessage(labels.invalid);
      return;
    }
    setPending(true);
    setStatus("idle");
    setMessage("");
    try {
      const query = new URLSearchParams({
        filename: file.name,
        altEn,
        altZh,
        focalX,
        focalY,
      });
      const response = await fetch(`/api/admin/media/upload?${query.toString()}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {"Content-Type": file.type},
        body: file,
      });
      if (!response.ok) {
        setStatus("error");
        setMessage(response.status >= 400 && response.status < 500 ? labels.invalid : labels.error);
        return;
      }
      setStatus("success");
      setMessage(labels.success);
      formRef.current?.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFile(null);
      setAltEn("");
      setAltZh("");
      setFocalX("50");
      setFocalY("50");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage(labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate onSubmit={submit} ref={formRef}>
      <div className="md:col-span-2">
        <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
        <p className="text-sm text-muted-foreground">{labels.description}</p>
      </div>
      <label className="text-sm font-semibold md:col-span-2" htmlFor="media-upload-file">
        {labels.file}
        <input
          accept="image/png,image/jpeg,image/webp"
          aria-describedby="media-upload-file-help"
          className={field}
          id="media-upload-file"
          name="file"
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          ref={fileInputRef}
          required
          type="file"
        />
        <p className="mt-1 text-xs text-muted-foreground" id="media-upload-file-help">{labels.fileHelp}</p>
      </label>
      <label className="text-sm font-semibold" htmlFor="media-upload-alt-en">
        {labels.altEn}
        <input className={field} id="media-upload-alt-en" maxLength={300} onChange={(event) => setAltEn(event.currentTarget.value)} required type="text" value={altEn}/>
      </label>
      <label className="text-sm font-semibold" htmlFor="media-upload-alt-zh">
        {labels.altZh}
        <input className={field} id="media-upload-alt-zh" maxLength={300} onChange={(event) => setAltZh(event.currentTarget.value)} required type="text" value={altZh}/>
      </label>
      <p className="text-xs text-muted-foreground md:col-span-2">{labels.altHelp}</p>
      <label className="text-sm font-semibold" htmlFor="media-upload-focal-x">
        {labels.focalX}
        <input className={field} id="media-upload-focal-x" max={100} min={0} onChange={(event) => setFocalX(event.currentTarget.value)} required step={1} type="number" value={focalX}/>
      </label>
      <label className="text-sm font-semibold" htmlFor="media-upload-focal-y">
        {labels.focalY}
        <input className={field} id="media-upload-focal-y" max={100} min={0} onChange={(event) => setFocalY(event.currentTarget.value)} required step={1} type="number" value={focalY}/>
      </label>
      <div className="flex items-center justify-end gap-4 md:col-span-2">
        {message ? <p aria-live="polite" className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
          {pending ? labels.uploading : labels.upload}
        </button>
      </div>
    </form>
  );
}
