"use client";

import {SeatOperationForm} from "@/components/portal/seat-operation-form";
import type {SeatAction, SeatFeedbackLabels} from "@/lib/portal/seat-action-state";

export function SeatInviteForm({action, labels, feedback, locale, companyId, canGrantOwner = false}: {action: SeatAction; feedback: SeatFeedbackLabels; labels: {email: string; invite: string; inviting: string; role: string; member: string; admin: string; owner: string}; locale: string; companyId: string; canGrantOwner?: boolean}) {
  return (
    <SeatOperationForm action={action} className="portal-form portal-seat-invite" labels={feedback} submitLabel={labels.invite} clearOnSuccess>
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
    </SeatOperationForm>
  );
}
