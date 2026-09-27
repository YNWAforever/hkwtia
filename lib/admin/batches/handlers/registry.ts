import "server-only";

import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import type {BatchHandlerRegistry} from "@/lib/admin/batches/worker-types";

export const batchOperationHandlers = {profile_patch: profilePatchBatchHandler} satisfies BatchHandlerRegistry;
