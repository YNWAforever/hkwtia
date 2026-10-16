import {readFileSync} from "node:fs";
import {z} from "zod";
const path=process.argv[2];if(!path)throw new Error("BROWSER_REPORT_REQUIRED");
const report=z.object({stats:z.object({expected:z.number(),unexpected:z.number(),skipped:z.number(),flaky:z.number()}),errors:z.array(z.unknown()).optional()}).parse(JSON.parse(readFileSync(path,"utf8")));
if(report.stats.expected<1||report.stats.unexpected||report.stats.skipped||report.stats.flaky||report.errors?.length)throw new Error(`BROWSER_ACCEPTANCE_INCOMPLETE: ${JSON.stringify(report.stats)}`);
console.log(`Browser acceptance: ${report.stats.expected} passed, zero skips/failures/flakes.`);
