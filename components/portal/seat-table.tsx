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
}>;

function roleLabel(role: CompanyMember["role"] | SeatInvitation["role"], labels: SeatTableLabels): string {
  return labels[role];
}

export function SeatTable({members, invitations, labels, canManage, revokeAction, changeRoleAction, revokeInvitationAction, canGrantOwner = false, locale}: {
  members: CompanyMember[];
  invitations: SeatInvitation[];
  labels: SeatTableLabels;
  canManage: boolean;
  revokeAction?: (formData: FormData) => void | Promise<void>;
  changeRoleAction?: (formData: FormData) => void | Promise<void>;
  revokeInvitationAction?: (formData: FormData) => void | Promise<void>;
  canGrantOwner?: boolean;
  locale: string;
}) {
  return (
    <div className="space-y-6">
      <section className="glass-card overflow-hidden p-5 sm:p-8" aria-labelledby="seat-members-heading">
        <h2 className="font-serif text-2xl font-semibold" id="seat-members-heading">{labels.members}</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-border/70 text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{labels.member}</th><th className="px-3 py-3 font-medium">{labels.role}</th><th className="px-3 py-3" /></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr className="border-b border-border/50 last:border-0" key={member.id}>
                  <td className="px-3 py-4">{member.userId}</td>
                  <td className="px-3 py-4">{roleLabel(member.role, labels)}</td>
                  <td className="px-3 py-4 text-right">
                    {canManage && (member.role !== "owner" || canGrantOwner) && changeRoleAction ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <form action={changeRoleAction} className="flex items-center gap-2">
                          <input name="memberId" type="hidden" value={member.id} />
                          <input name="locale" type="hidden" value={locale} />
                          <label className="sr-only" htmlFor={`role-${member.id}`}>{labels.changeRole}</label>
                          <select className="min-h-9 rounded-md border border-input bg-background px-2" defaultValue={member.role} id={`role-${member.id}`} name="role">
                            <option value="member">{labels.member}</option>
                            <option value="admin">{labels.admin}</option>{canGrantOwner ? <option value="owner">{labels.owner}</option> : null}
                          </select>
                          <button className="text-sm font-medium text-primary underline-offset-4 hover:underline" type="submit">{labels.changeRole}</button>
                        </form>
                        {revokeAction ? <form action={revokeAction}><input name="memberId" type="hidden" value={member.id} /><input name="locale" type="hidden" value={locale} /><button className="text-sm font-medium text-destructive underline-offset-4 hover:underline" type="submit">{labels.revoke}</button></form> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="glass-card overflow-hidden p-5 sm:p-8" aria-labelledby="seat-pending-heading">
        <h2 className="font-serif text-2xl font-semibold" id="seat-pending-heading">{labels.pending}</h2>
        {invitations.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{labels.noPending}</p> : (
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="border-b border-border/70 text-muted-foreground"><tr><th className="px-3 py-3 font-medium">{labels.email}</th><th className="px-3 py-3 font-medium">{labels.role}</th><th className="px-3 py-3" /></tr></thead><tbody>{invitations.map((invitation) => <tr className="border-b border-border/50 last:border-0" key={invitation.id}><td className="px-3 py-4">{invitation.invitedEmail}</td><td className="px-3 py-4">{roleLabel(invitation.role, labels)}</td><td className="px-3 py-4 text-right">{canManage && revokeInvitationAction ? <form action={revokeInvitationAction}><input name="invitationId" type="hidden" value={invitation.id} /><input name="locale" type="hidden" value={locale} /><button className="text-sm font-medium text-destructive underline-offset-4 hover:underline" type="submit">{labels.inviteRevoke}</button></form> : null}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}