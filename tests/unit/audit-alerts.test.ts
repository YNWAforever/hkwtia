import {describe,expect,it} from "vitest";
import {evaluateAuditAlerts,auditAlertTransitions} from "@/lib/observability/audit-alerts";
const now="2026-09-27T00:10:00.000Z";
const base={now,webhookLagMs:0,oldestNotificationMs:0,batchFailures:0,jobs:[{kind:"ticket-emails",enabled:true,intervalMs:60000,lastCompletedAt:"2026-09-27T00:09:00.000Z"}]};
describe("dry-run operational alert rules",()=>{
  it("triggers each signal, avoids repeat notifications and recovers after valid healthy samples",()=>{
    const normal=evaluateAuditAlerts(base);
    const bad=evaluateAuditAlerts({...base,webhookLagMs:300001,oldestNotificationMs:300001,batchFailures:2,jobs:[{...base.jobs[0],lastCompletedAt:"2026-09-27T00:06:00.000Z"}]});
    expect(bad.filter(item=>item.state==='firing').map(item=>item.key)).toEqual(['webhook-lag','notification-age','batch-failures','job:ticket-emails']);
    expect(auditAlertTransitions(normal,bad)).toHaveLength(4);
    expect(auditAlertTransitions(bad,bad)).toEqual([]);
    expect(auditAlertTransitions(bad,normal)).toEqual(bad.map(item=>({key:item.key,event:'recovered'})));
  });
  it("does not treat absent observations or disabled jobs as successful recovery",()=>{
    const bad=evaluateAuditAlerts({...base,webhookLagMs:900000});
    const unknown=evaluateAuditAlerts({...base,webhookLagMs:null,jobs:[{...base.jobs[0],enabled:false,lastCompletedAt:null}]});
    expect(unknown.find(item=>item.key==='webhook-lag')?.state).toBe('unknown');
    expect(unknown.some(item=>item.key==='job:ticket-emails')).toBe(false);
    expect(auditAlertTransitions(bad,unknown)).toEqual([]);
  });
  it("rejects malformed or private source data rather than echoing it",()=>{
    expect(()=>evaluateAuditAlerts({...base,email:'private@example.test'})).toThrow();
  });
});
