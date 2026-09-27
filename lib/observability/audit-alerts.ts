import {z} from "zod";
export const auditHealthSchema=z.object({
  now:z.string().datetime(),
  webhookLagMs:z.number().nonnegative().nullable(),
  oldestNotificationMs:z.number().nonnegative().nullable(),
  batchFailures:z.number().int().nonnegative().nullable(),
  jobs:z.array(z.object({kind:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),enabled:z.boolean(),intervalMs:z.number().positive(),lastCompletedAt:z.string().datetime().nullable()}).strict()).max(100),
}).strict();
export const auditThresholdSchema=z.object({webhookLagMs:z.number().positive(),oldestNotificationMs:z.number().positive(),batchFailures:z.number().int().positive(),missedIntervals:z.number().int().positive()}).strict();
/** Proposed operational thresholds, not approved association service levels. */
export const AUDIT_MONITOR_DEFAULTS={webhookLagMs:300000,oldestNotificationMs:300000,batchFailures:1,missedIntervals:3} as const;
export type AuditSignal=Readonly<{key:string;state:"firing"|"ok"|"unknown";value:number|null;threshold:number}>;
export function evaluateAuditAlerts(input:unknown,thresholds:unknown=AUDIT_MONITOR_DEFAULTS):AuditSignal[]{
  const sample=auditHealthSchema.parse(input), limits=auditThresholdSchema.parse(thresholds);
  const signal=(key:string,value:number|null,threshold:number,inclusive=false):AuditSignal=>({key,value,threshold,state:value===null?'unknown':(inclusive?value>=threshold:value>threshold)?'firing':'ok'});
  const now=Date.parse(sample.now);
  return [signal('webhook-lag',sample.webhookLagMs,limits.webhookLagMs),signal('notification-age',sample.oldestNotificationMs,limits.oldestNotificationMs),signal('batch-failures',sample.batchFailures,limits.batchFailures,true),
    ...sample.jobs.filter(job=>job.enabled).map(job=>{const last=job.lastCompletedAt?Date.parse(job.lastCompletedAt):null;return signal('job:'+job.kind,last===null||last>now?null:Math.floor((now-last)/job.intervalMs),limits.missedIntervals,true);}),
  ];
}
export function auditAlertTransitions(previous:readonly AuditSignal[],current:readonly AuditSignal[]):Readonly<{key:string;event:"triggered"|"recovered"}>[]{
  const prior=new Map(previous.map(item=>[item.key,item.state]));
  return current.flatMap<Readonly<{key:string;event:"triggered"|"recovered"}>>(item=>item.state==='firing'&&prior.get(item.key)!=='firing'?[{key:item.key,event:'triggered' as const}]:item.state==='ok'&&prior.get(item.key)==='firing'?[{key:item.key,event:'recovered' as const}]:[]);
}
