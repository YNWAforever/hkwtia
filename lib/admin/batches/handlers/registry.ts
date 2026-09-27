import "server-only";

import {importCommitBatchHandler} from "@/lib/admin/batches/handlers/import-commit";
import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import type {BatchHandlerRegistry} from "@/lib/admin/batches/worker-types";

export const batchOperationHandlers = {profile_patch: profilePatchBatchHandler, import_commit: importCommitBatchHandler} satisfies BatchHandlerRegistry;
