import {automationCronActor} from "@/lib/auth/automation-actor";
import {importRetentionRepository} from "@/lib/db/repos/member-import-retention";
import {createJobPost,JobRequestError} from "@/lib/jobs/handler";

export const POST=createJobPost<{dryRun:boolean}>({
  kind:"member-import-retention",bucket:"ten-minute",
  prepare:async(request,now)=>{
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>key!=="dryRun")||query.getAll("dryRun").length>1||![null,"true","false"].includes(query.get("dryRun")))throw new JobRequestError(400,"INVALID_RETENTION_REQUEST");
    const dryRun=query.get("dryRun")==="true";
    return {value:{dryRun},...(dryRun?{runKey:`member-import-retention:dry-run:${now.toISOString().slice(0,15)}0`}:{})};
  },
  run:({now,prepared})=>importRetentionRepository.sweep(automationCronActor(),now,prepared.dryRun),
});
