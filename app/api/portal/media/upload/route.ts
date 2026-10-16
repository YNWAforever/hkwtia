import {requireActor} from "@/lib/auth/actor";
import {appEnv} from "@/lib/config/env";
import {createMemberMediaUploadPost, uploadMemberMedia} from "@/lib/portal/media-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// requireActor resolves any signed-in actor; the factory's requireMember gate
// then turns staff and anything else into the same 404 a visitor gets.
export const POST = createMemberMediaUploadPost({
  actor: requireActor,
  expectedOrigin: () => appEnv().appUrl,
  upload: uploadMemberMedia,
});
