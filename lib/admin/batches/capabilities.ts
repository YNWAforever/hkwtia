import 'server-only';
import {batchOperationHandlers} from '@/lib/admin/batches/handlers/registry';
import type {BatchOperation} from '@/lib/admin/batches/types';
import {requireAdmin} from '@/lib/auth/authorize';
import type {AdminActor} from '@/lib/membership/lifecycle';
export type BatchCapability = Readonly<{operation: BatchOperation; available: boolean; reasonCode: 'BATCH_OPERATION_UNAVAILABLE' | 'FORBIDDEN' | null}>;
const operationFlags: Readonly<Record<BatchOperation, readonly string[]>> = {
  profile_patch: [], import_commit: ['MEMBER_IMPORT_ENABLED'],
  membership_grant: ['MEMBERSHIP_GRANTS_ENABLED','MEMBERSHIP_GRANT_BATCH_ENABLED'],
  renewal_reminder: ['MEMBER_COMMUNICATION_BATCH_ENABLED'], profile_update_invite: ['MEMBER_COMMUNICATION_BATCH_ENABLED'],
  export_members: ['MEMBER_EXPORT_ENABLED'], export_event_attendees: ['EVENT_ATTENDEE_EXPORT_ENABLED'], ticket_resend: ['TICKET_RESEND_BATCH_ENABLED'],
};
/** The optional registered set is a server-only test port; actions never accept it from a client. */
export function resolveBatchCapability(actor: AdminActor, operation: BatchOperation, registered?: ReadonlySet<BatchOperation>): BatchCapability {
  requireAdmin(actor);
  const registeredOperations = registered ?? new Set(process.env.ADMIN_BATCH_ENABLED === 'true' ? Object.keys(batchOperationHandlers) as BatchOperation[] : []);
  const unavailable = !registeredOperations.has(operation) || operationFlags[operation].some(name => process.env[name] !== 'true');
  const reasonCode = unavailable ? 'BATCH_OPERATION_UNAVAILABLE' : operation === 'membership_grant' && actor.kind !== 'superadmin' ? 'FORBIDDEN' : null;
  return {operation, available: reasonCode === null, reasonCode};
}
export async function getBatchCapabilities(actor: AdminActor): Promise<readonly BatchCapability[]> {
  requireAdmin(actor);
  return (Object.keys(batchOperationHandlers) as BatchOperation[]).map(operation => resolveBatchCapability(actor,operation));
}
