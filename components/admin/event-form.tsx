type Labels = Readonly<{slug: string; titleEn: string; titleZh: string; descriptionEn: string; descriptionZh: string; startsAt: string; endsAt: string; venue: string; capacity: string; memberOnly: string; published: string; save: string}>;
type Values = Partial<Readonly<{slug: string; titleEn: string; titleZh: string | null; descriptionEn: string; descriptionZh: string | null; startsAt: Date; endsAt: Date | null; venue: string | null; capacity: number | null; memberOnly: boolean; published: boolean}>>;

export function EventForm({action, labels, values = {}}: Readonly<{action: (formData: FormData) => Promise<void>; labels: Labels; values?: Values}>) {
  const dateValue = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 16) : "";
  return <form action={action} className="glass-card grid gap-4 p-6 md:grid-cols-2">
    <label>{labels.slug}<input className="mt-1 w-full rounded-md border p-2" defaultValue={values.slug} name="slug" required/></label>
    <label>{labels.titleEn}<input className="mt-1 w-full rounded-md border p-2" defaultValue={values.titleEn} name="titleEn" required/></label>
    <label>{labels.titleZh}<input className="mt-1 w-full rounded-md border p-2" defaultValue={values.titleZh ?? ""} name="titleZh"/></label>
    <label>{labels.startsAt}<input className="mt-1 w-full rounded-md border p-2" defaultValue={dateValue(values.startsAt)} name="startsAt" required type="datetime-local"/></label>
    <label>{labels.endsAt}<input className="mt-1 w-full rounded-md border p-2" defaultValue={dateValue(values.endsAt)} name="endsAt" type="datetime-local"/></label>
    <label>{labels.venue}<input className="mt-1 w-full rounded-md border p-2" defaultValue={values.venue ?? ""} name="venue"/></label>
    <label>{labels.capacity}<input className="mt-1 w-full rounded-md border p-2" defaultValue={values.capacity ?? ""} min="1" name="capacity" type="number"/></label>
    <label className="flex items-center gap-2"><input defaultChecked={values.memberOnly} name="memberOnly" type="checkbox"/>{labels.memberOnly}</label>
    <label className="flex items-center gap-2"><input defaultChecked={values.published} name="published" type="checkbox"/>{labels.published}</label>
    <label className="md:col-span-2">{labels.descriptionEn}<textarea className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={values.descriptionEn} name="descriptionEn" required/></label>
    <label className="md:col-span-2">{labels.descriptionZh}<textarea className="mt-1 min-h-24 w-full rounded-md border p-2" defaultValue={values.descriptionZh ?? ""} name="descriptionZh"/></label>
    <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground md:col-span-2" type="submit">{labels.save}</button>
  </form>;
}
