import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {wisetechIntegrationProvenance} from "../config/wisetech-integration-manifest.ts";
const input="public/archive/tech-connect-ai-leaders.webp";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const bytes=readFileSync(input);
const pinned=wisetechIntegrationProvenance.site.currentDonor.photos.find(photo=>photo.canonicalPath===input);
assert(pinned);assert.equal(sha(bytes).toUpperCase(),pinned.sha256);
const outputs=[];
for(const width of [480,960,1800]){
  const file=`public/archive/tech-connect-ai-leaders-${width}.webp`;
  const result=await sharp(bytes).resize({width,withoutEnlargement:true}).webp({quality:75,effort:4}).toBuffer({resolveWithObject:true});
  assert.equal(result.info.width,width);assert(result.data.length<bytes.length);
  writeFileSync(file,result.data);
  outputs.push({file,width,height:result.info.height,bytes:result.data.length,sha256:sha(result.data)});
}
const receipt={input,inputSha256:sha(bytes),inputBytes:bytes.length,originalPinnedBytesUnchanged:true,quality:75,resize:'maintain aspect ratio; no enlargement',sharpVersion:sharp.versions.sharp,outputs};
writeFileSync('docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/hero-precomputed.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
