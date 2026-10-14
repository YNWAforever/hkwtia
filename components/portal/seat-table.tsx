import {SeatOperationForm} from "@/components/portal/seat-operation-form";
import type {SeatAction, SeatFeedbackLabels} from "@/lib/portal/seat-action-state";
import type {SeatMember} from "@/lib/db/repos/portal-content";
import type {CompanyMember, SeatInvitation} from "@/lib/db/server-schema";

export type SeatTableLabels = Readonly<{
  members: string;
  pending: string;
  member: string;
  email: string;
  role: string;
  revoke: string;
  changeRole: string;
  owner: string;
  admin: string;
  noPending: string;
  inviteRevoke: string;
  actions: string;
  details: string;
  unknownName: string;
  revokeConfirm: string;
  invitationConfirm: string;
}>;

function roleLabel(role: CompanyMember["role"] | SeatInvitation["role"], labels: SeatTableLabels): string {
  return labels[role];
}

export function SeatTable({members, invitations, labels, feedback, canManage, revokeAction, changeRoleAction, revokeInvitationAction, canGrantOwner = false, locale}: {
  members: SeatMember[];
  invitations: SeatInvitation[];
  labels: SeatTableLabels;
  feedback: SeatFeedbackLabels;
  canManage: boolean;
  revokeAction?: SeatAction;
  changeRoleAction?: SeatAction;
  revokeInvitationAction?: SeatAction;
  canGrantOwner?: boolean;
  locale: string;
}) {
  // Each cell repeats its column header as data-label: at <=820px CSS stacks the row and prints it
  // as a caption, so no control needs a second DOM copy. display:block on table/tr/td drops the
  // implicit table roles in Safari/VoiceOver, so every part carries its role explicitly.
  return (
    <div className="portal-seat-tables">
      <section aria-labelledby="seat-members-heading" className="portal-seat-section">
        <h2 className="portal-section-title" id="seat-members-heading">{labels.members}</h2>
        <table className="portal-seat-table" role="table">
          <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">{labels.member}</th><th role="columnheader" scope="col">{labels.role}</th><th role="columnheader" scope="col"><span className="sr-only">{labels.actions}</span></th></tr></thead>
          <tbody role="rowgroup">
            {members.map((member) => (
              <tr key={member.id} role="row">
                <td role="cell" data-label={labels.member}><span>{member.displayName || labels.unknownName}</span>{canManage && member.email ? <span className="block">{member.email}</span> : null}<details><summary>{labels.details}</summary>{member.userId}</details></td>
                <td role="cell" data-label={labels.role}>{roleLabel(member.role, labels)}</td>
                <td role="cell"><div className="portal-seat-actions">
                  {canManage && (member.role !== "owner" || canGrantOwner) && changeRoleAction ? (
                    <>
                      <SeatOperationForm action={changeRoleAction} labels={feedback} submitLabel={labels.changeRole} buttonClassName="portal-seat-link">
                        <input name="memberId" type="hidden" value={member.id} />
                        <input name="companyId" type="hidden" value={member.companyId} />
                        <input name="locale" type="hidden" value={locale} />
                        <label className="sr-only" htmlFor={`role-${member.id}`}>{labels.changeRole}</label>
                        <select defaultValue={member.role} id={`role-${member.id}`} name="role">
                          <option value="member">{labels.member}</option>
                          <option value="admin">{labels.admin}</option>
                          {canGrantOwner ? <option value="owner">{labels.owner}</option> : null}
                        </select>

                      </SeatOperationForm>
                      {revokeAction ? (
                        <SeatOperationForm action={revokeAction} labels={feedback} submitLabel={labels.revoke} buttonClassName="portal-seat-link portal-seat-danger" confirmation={labels.revokeConfirm.replace("{member}", member.displayName || member.email || labels.unknownName)}>
                          <input name="memberId" type="hidden" value={member.id} />
                        <input name="companyId" type="hidden" value={member.companyId} />
                          <input name="locale" type="hidden" value={locale} />

                        </SeatOperationForm>
                      ) : null}
                    </>
                  ) : null}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="seat-pending-heading" className="portal-seat-section">
        <h2 className="portal-section-title" id="seat-pending-heading">{labels.pending}</h2>
        {invitations.length === 0 ? <p className="portal-field-help">{labels.noPending}</p> : (
          <table className="portal-seat-table" role="table">
            <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">{labels.email}</th><th role="columnheader" scope="col">{labels.role}</th><th role="columnheader" scope="col"><span className="sr-only">{labels.actions}</span></th></tr></thead>
            <tbody role="rowgroup">
              {invitations.map((invitation) => (
                <tr key={invitation.id} role="row">
                  <td role="cell" data-label={labels.email}>{invitation.invitedEmail}</td>
                  <td role="cell" data-label={labels.role}>{roleLabel(invitation.role, labels)}</td>
                  <td role="cell"><div className="portal-seat-actions">
                    {canManage && revokeInvitationAction ? (
                      <SeatOperationForm action={revokeInvitationAction} labels={feedback} submitLabel={labels.inviteRevoke} buttonClassName="portal-seat-link portal-seat-danger" confirmation={labels.invitationConfirm.replace("{email}", invitation.invitedEmail)}>
                        <input name="invitationId" type="hidden" value={invitation.id} />
                        <input name="companyId" type="hidden" value={invitation.companyId} />
                        <input name="locale" type="hidden" value={locale} />

                      </SeatOperationForm>
                    ) : null}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
