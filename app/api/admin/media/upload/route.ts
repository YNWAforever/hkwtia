import {uploadMedia} from "@/lib/admin/media-upload-service";
import {createMediaUploadPost} from "@/lib/admin/media-upload-route";
import {requireAdminActor} from "@/lib/auth/actor";
import {appEnv} from "@/lib/config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createMediaUploadPost({
  actor: requireAdminActor,
  expectedOrigin: () => appEnv().appUrl,
  upload: uploadMedia,
});
