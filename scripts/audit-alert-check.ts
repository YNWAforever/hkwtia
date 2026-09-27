import {readFileSync} from "node:fs";
import {z} from "zod";
import {auditAlertTransitions,evaluateAuditAlerts} from "../lib/observability/audit-alerts";
// Local dry run only. Never sends notifications or reads environment credentials.
const path=process.argv[2];
if(!path)throw new Error("Usage: npx tsx scripts/audit-alert-check.ts <aggregate-snapshot.json> [previous-report.json] [thresholds.json]");
const previousSchema=z.object({signals:z.array(z.object({key:z.string().regex(/^(webhook-lag|notification-age|batch-failures|job:[a-z][a-z0-9-]{0,63})$/),state:z.enum(["ok","unknown","firing"]),value:z.number().nullable(),threshold:z.number()}))}).passthrough();
const previous=process.argv[3]?previousSchema.parse(JSON.parse(readFileSync(process.argv[3],"utf8"))).signals:[];
const thresholds=process.argv[4]?JSON.parse(readFileSync(process.argv[4],"utf8")):undefined;
const signals=evaluateAuditAlerts(JSON.parse(readFileSync(path,"utf8")),thresholds);
const transitions=auditAlertTransitions(previous,signals);
// Keep the last known state across a missing sample; absence cannot recover an alert.
const state=signals.map(item=>item.state==='unknown'?previous.find(old=>old.key===item.key)??item:item);
console.log(JSON.stringify({dryRun:true,signals:state,observed:signals,transitions},null,2));
