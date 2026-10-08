"use client";

import {useFormStatus} from "react-dom";

function SubmitButton({label, pendingLabel}: {label: string; pendingLabel: string}) {
  const {pending} = useFormStatus();
  return <button className="button" disabled={pending} type="submit">{pending ? pendingLabel : label}</button>;
}

export function SeatInviteForm({action, labels, locale, companyId, canGrantOwner = false}: {action: (formData: FormData) => void | Promise<void>; labels: {email: string; invite: string; inviting: string; role: string; member: string; admin: string; owner: string}; locale: string; companyId: string; canGrantOwner?: boolean}) {
  return (
    <form action={action} className="portal-form portal-seat-invite">
      <input name="companyId" type="hidden" value={companyId} />
      <input name="locale" type="hidden" value={locale} />
      <div className="portal-pair">
        <div className="portal-field">
          <label htmlFor="seat-invite-email">{labels.email}</label>
          <input id="seat-invite-email" name="email" required type="email" />
        </div>
        <div className="portal-field">
          <label htmlFor="seat-invite-role">{labels.role}</label>
          <select defaultValue="member" id="seat-invite-role" name="role">
            <option value="member">{labels.member}</option>
            <option value="admin">{labels.admin}</option>
            {canGrantOwner ? <option value="owner">{labels.owner}</option> : null}
          </select>
        </div>
      </div>
      <div className="portal-form-actions"><SubmitButton label={labels.invite} pendingLabel={labels.inviting} /></div>
    </form>
  );
}
