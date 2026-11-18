/**
 * Installs the 17 verified public image files. Does not fetch, and does not
 * rewrite those bytes. The PDF and the ExCo 404 stay open.
 */
import {createHash} from "node:crypto";
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import sharp from "sharp";

const verification = JSON.parse(readFileSync("/tmp/news-assets/media-verification.json", "utf8")) as {
  files: {
    source_url: string;
    saved_path?: string;
    bytes: string;
    sha256?: string;
    wxr_filesize: number | null;
    result?: string;
  }[];
};

const claims: Record<string, "wxr-size-match" | "current-url-not-wxr-proven" | "wxr-size-unknown"> = {};
const baselinePath = "content/news-archive/html-extract-baseline.json";
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {plainChars: Record<string, number>; assets: Record<string, {localPath: string; originalPath: string | null; sha256: string}>};

let installed = 0;
for (const record of verification.files) {
  if (record.result === "HTTP 404; not downloaded" || record.source_url.endsWith(".pdf") || !record.sha256) continue;
  const name = decodeURIComponent(record.source_url.split("/").pop() ?? "");
  const source = join("/tmp/news-assets/images", name);
  const bytes = readFileSync(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== record.sha256 || String(bytes.length) !== String(record.bytes)) {
    throw new Error(`checksum mismatch ${record.source_url}`);
  }
  const id = sha256.slice(0, 16);
  const extension = name.toLowerCase().endsWith(".png") ? "png" : name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg") ? "jpg" : "bin";
  const originalPath = `/images/news-archive/original/${id}.${extension}`;
  mkdirSync("public/images/news-archive/original", {recursive: true});
  mkdirSync("public/images/news-archive/display", {recursive: true});
  copyFileSync(source, join("public", originalPath));
  const display = await sharp(bytes, {failOn: "none"}).rotate().resize({width: 1600, height: 1600, fit: "inside", withoutEnlargement: true}).jpeg({quality: 78}).toBuffer();
  const displayPath = `/images/news-archive/display/${id}.jpg`;
  writeFileSync(join("public", displayPath), display);
  const key = record.source_url.split("?")[0] ?? record.source_url;
  baseline.assets[key] = {localPath: displayPath, originalPath, sha256};
  const wxr = record.wxr_filesize;
  claims[key] = wxr == null ? "wxr-size-unknown" : Number(wxr) === bytes.length ? "wxr-size-match" : "current-url-not-wxr-proven";
  installed += 1;
}

writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
writeFileSync("content/news-archive/asset-byte-claims.json", `${JSON.stringify(claims, null, 2)}\n`);
console.log(JSON.stringify({installed, claims: Object.values(claims).reduce<Record<string, number>>((counts, claim) => ({...counts, [claim]: (counts[claim] ?? 0) + 1}), {})}));
