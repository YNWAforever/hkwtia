import {createMemberImportUploadPost} from "@/lib/admin/imports/upload-route";
import {uploadMemberImport} from "@/lib/admin/imports/service";
import {requireAdminActor} from "@/lib/auth/actor";
import {appEnv} from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createMemberImportUploadPost({actor: requireAdminActor, expectedOrigin: () => appEnv().appUrl, upload: uploadMemberImport});
