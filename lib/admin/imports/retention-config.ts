import {z} from "zod";
/** Proposed retention defaults; the scrub worker remains separately disabled. */
export function importRetentionConfig(env:NodeJS.ProcessEnv=process.env){
  const days=(value:string|undefined,fallback:number)=>z.coerce.number().int().min(1).max(365).parse(value??fallback)*86400000;
  return {uploadMs:days(env.MEMBER_IMPORT_UPLOAD_RETENTION_DAYS,7),stagingMs:days(env.MEMBER_IMPORT_STAGING_RETENTION_DAYS,30)};
}
