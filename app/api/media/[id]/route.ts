import {getUploadedMediaForDelivery} from "@/lib/db/repos/media";
import {createMediaGet} from "@/lib/media/media-delivery-route";
import {privateR2Storage} from "@/lib/media/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createMediaGet({
  load: getUploadedMediaForDelivery,
  storage: privateR2Storage,
});
