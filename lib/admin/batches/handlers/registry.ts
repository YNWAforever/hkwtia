import {renewalReminderBatchHandler} from "@/lib/admin/batches/handlers/renewal-reminder";
import {profileUpdateInviteBatchHandler} from "@/lib/admin/batches/handlers/profile-update-invite";
import "server-only";

import {importCommitBatchHandler} from "@/lib/admin/batches/handlers/import-commit";
import {membershipGrantBatchHandler} from "@/lib/admin/batches/handlers/membership-grant";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {exportMembersBatchHandler} from "@/lib/admin/batches/handlers/export-members";
import {ticketResendBatchHandler} from "@/lib/admin/batches/handlers/ticket-resend";
import type {BatchHandlerRegistry} from "@/lib/admin/batches/worker-types";

export const batchOperationHandlers = {renewal_reminder: renewalReminderBatchHandler, profile_update_invite: profileUpdateInviteBatchHandler, profile_patch: profilePatchBatchHandler, import_commit: importCommitBatchHandler, membership_grant: membershipGrantBatchHandler, ticket_resend: ticketResendBatchHandler, export_members: exportMembersBatchHandler} satisfies BatchHandlerRegistry;
