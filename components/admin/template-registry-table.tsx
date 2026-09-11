/**
 * Programme C-7. The WhatsApp template registry as staff read it.
 *
 * A Server Component with plain `<form action={…}>` elements, like
 * `components/admin/profile-review-table.tsx`: nothing here needs browser state,
 * and a `"use client"` boundary would only drag the whole table into the client
 * bundle so that four buttons could submit.
 *
 * Every string arrives through `labels`, resolved from `Admin.templates` by the
 * page. `elementName` and `variables` are the two the reviewer actually needs:
 * the element name is the string they will read back in the WOZTELL console when
 * Meta rejects something, and the ordered variables are what
 * `sendTemplateMessage` maps into BODY parameters — an order that drifts from
 * the config sends the right words in the wrong slots and Meta accepts it.
 */
export type TemplateRegistryRow = Readonly<{
  key: string;
  elementName: string;
  languageCode: string;
  category: "marketing" | "utility" | "authentication";
  variables: readonly string[];
  status: "pending" | "approved" | "rejected" | "disabled";
  approvedAt: string | null;
  rejectionReason: string | null;
  previewEn: string;
  previewZhHk: string;
}>;

type Action = (formData: FormData) => void | Promise<void>;

export type TemplateRegistryLabels = Readonly<{
  caption: string;
  key: string;
  elementName: string;
  language: string;
  category: string;
  variables: string;
  status: string;
  approvedAt: string;
  approve: string;
  reject: string;
  disable: string;
  rejectionReason: string;
  previewEn: string;
  previewZhHk: string;
  savePreview: string;
  empty: string;
  statusLabel: Readonly<Record<TemplateRegistryRow["status"], string>>;
  categoryLabel: Readonly<Record<TemplateRegistryRow["category"], string>>;
}>;

export function TemplateRegistryTable({
  rows,
  labels,
  approveAction,
  rejectAction,
  disableAction,
  savePreviewsAction,
}: Readonly<{
  rows: readonly TemplateRegistryRow[];
  labels: TemplateRegistryLabels;
  approveAction: Action;
  rejectAction: Action;
  disableAction: Action;
  savePreviewsAction: Action;
}>) {
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-border/70 text-muted-foreground">
            <th className="px-3 py-3">{labels.key}</th>
            <th className="px-3 py-3">{labels.elementName}</th>
            <th className="px-3 py-3">{labels.language}</th>
            <th className="px-3 py-3">{labels.category}</th>
            <th className="px-3 py-3">{labels.variables}</th>
            <th className="px-3 py-3">{labels.status}</th>
            <th className="px-3 py-3">{labels.approvedAt}</th>
            <th className="px-3 py-3">{labels.approve}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-border/50 align-top" key={row.key}>
              <td className="px-3 py-4 font-mono text-xs">{row.key}</td>
              <td className="px-3 py-4 font-mono text-xs">{row.elementName}</td>
              <td className="px-3 py-4">{row.languageCode}</td>
              <td className="px-3 py-4">{labels.categoryLabel[row.category]}</td>
              {/* Joined rather than listed: the ORDER is the fact worth reading,
                  and a bulleted list invites the eye to treat it as a set. */}
              <td className="px-3 py-4 font-mono text-xs">{row.variables.join(", ") || "—"}</td>
              <td className="px-3 py-4">
                <span>{labels.statusLabel[row.status]}</span>
                {row.rejectionReason ? <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{row.rejectionReason}</p> : null}
              </td>
              <td className="px-3 py-4 font-mono text-xs">{row.approvedAt ?? "—"}</td>
              <td className="px-3 py-4">
                <div className="space-y-3">
                  <form action={approveAction}>
                    <input name="key" type="hidden" value={row.key} />
                    <button className="min-h-11 rounded-md bg-primary px-3 py-2 text-primary-foreground" type="submit">{labels.approve}</button>
                  </form>
                  <form action={rejectAction} className="space-y-2">
                    <input name="key" type="hidden" value={row.key} />
                    <label className="sr-only" htmlFor={`template-reason-${row.key}`}>{labels.rejectionReason}</label>
                    <textarea className="min-h-16 w-48 rounded-md border border-input bg-background p-2" id={`template-reason-${row.key}`} maxLength={1000} name="rejectionReason" required />
                    <button className="min-h-11 rounded-md border border-input px-3 py-2" type="submit">{labels.reject}</button>
                  </form>
                  <form action={disableAction} className="space-y-2">
                    <input name="key" type="hidden" value={row.key} />
                    <label className="sr-only" htmlFor={`template-disable-reason-${row.key}`}>{labels.rejectionReason}</label>
                    {/* Not `required`: a disable is usually Meta pausing a
                        template on us, and forcing a sentence staff do not have
                        yet only produces "n/a" rows. */}
                    <textarea className="min-h-16 w-48 rounded-md border border-input bg-background p-2" id={`template-disable-reason-${row.key}`} maxLength={1000} name="rejectionReason" />
                    <button className="min-h-11 rounded-md border border-input px-3 py-2" type="submit">{labels.disable}</button>
                  </form>
                  <form action={savePreviewsAction} className="space-y-2">
                    <input name="key" type="hidden" value={row.key} />
                    <label className="block text-xs text-muted-foreground" htmlFor={`template-preview-en-${row.key}`}>{labels.previewEn}</label>
                    <textarea className="min-h-16 w-48 rounded-md border border-input bg-background p-2" defaultValue={row.previewEn} id={`template-preview-en-${row.key}`} maxLength={2000} name="previewEn" />
                    <label className="block text-xs text-muted-foreground" htmlFor={`template-preview-zh-${row.key}`}>{labels.previewZhHk}</label>
                    <textarea className="min-h-16 w-48 rounded-md border border-input bg-background p-2" defaultValue={row.previewZhHk} id={`template-preview-zh-${row.key}`} maxLength={2000} name="previewZhHk" />
                    <button className="min-h-11 rounded-md border border-input px-3 py-2" type="submit">{labels.savePreview}</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
