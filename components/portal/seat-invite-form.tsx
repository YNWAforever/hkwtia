"use client";

import {useFormStatus} from "react-dom";

function SubmitButton({label, pendingLabel}: {label: string; pendingLabel: string}) {
  const {pending} = useFormStatus();
  return <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">{pending ? pendingLabel : label}</button>;
}

export function SeatInviteForm({action, labels, locale, companyId, canGrantOwner = false}: {action: (formData: FormData) => void | Promise<void>; labels: {email: string; invite: string; inviting: string; role: string; member: string; admin: string; owner: string}; locale: string; companyId: string; canGrantOwner?: boolean}) {
  return <form action={action} className="glass-card grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8"><input name="companyId" type="hidden" value={companyId} /><input name="locale" type="hidden" value={locale} /><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>{labels.email}</span><input aria-label={labels.email} className="min-h-11 w-full rounded-md border border-input bg-background px-3" name="email" required type="email" /></label><label className="space-y-2 text-sm font-medium"><span>{labels.role}</span><select aria-label={labels.role} className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue="member" name="role"><option value="member">{labels.member}</option><option value="admin">{labels.admin}</option>{canGrantOwner ? <option value="owner">{labels.owner}</option> : null}</select></label></div><SubmitButton label={labels.invite} pendingLabel={labels.inviting} /></form>;
}
