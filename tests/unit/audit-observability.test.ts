import {afterEach,describe,expect,it,vi} from "vitest";
import {createJobPost} from "@/lib/jobs/handler";
import {createWebhookPost} from "@/lib/api/stripe-webhook-route";
import {checkoutCompleted} from "@/tests/fixtures/stripe-events";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("audit operational telemetry",()=>{
  it("records only aggregate settled job counters and a server-generated correlation id",async()=>{
    vi.stubEnv("AUDIT_METRICS_ENABLED","true");vi.stubEnv("VERCEL_GIT_COMMIT_SHA","a".repeat(40));
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    const jobs={claim:vi.fn(async()=>({status:"claimed" as const,attemptCount:1})),complete:vi.fn(async()=>true),fail:vi.fn(async()=>true)};
    const post=createJobPost({kind:"admin-batches",bucket:"minute",jobs,secret:()=>"fixture-secret",run:async()=>({claimed:10,settled:8,failed:2,email:"private@example.test"})});
    const response=await post(new Request("https://app.example.test/api/jobs/admin-batches",{method:"POST",headers:{authorization:"Bearer fixture-secret","x-request-id":"private@example.test"}}));
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const metric=JSON.parse(log.mock.calls[0]![0] as string);
    expect(metric).toMatchObject({event:"job_result",kind:"admin-batches",outcome:"completed",status:200,counters:{claimed:10,settled:8,failed:2},revision:"a".repeat(40)});
    expect(JSON.stringify(metric)).not.toMatch(/private@example|fixture-secret/);
    expect(metric.requestId).toBe(response.headers.get("x-request-id"));
  });
  it("reports verified webhook lag and failure without logging payload or changing retry semantics",async()=>{
    vi.stubEnv("AUDIT_METRICS_ENABLED","true");
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    const event={...checkoutCompleted(),created:Math.floor(Date.now()/1000)-600};
    const processEvent=vi.fn().mockRejectedValue(new Error("private database failure"));
    const post=createWebhookPost({constructEvent:()=>event,processEvent});
    const response=await post(new Request("https://app.example.test/api/stripe/webhook",{method:"POST",body:"private payload",headers:{"stripe-signature":"secret"}}));
    expect(response.status).toBe(500);
    const metric=JSON.parse(log.mock.calls[0]![0] as string);
    expect(metric).toMatchObject({event:"stripe_webhook_result",outcome:"failed",status:500});
    expect(metric.lagMs).toBeGreaterThanOrEqual(600000);
    expect(JSON.stringify(metric)).not.toMatch(/private|secret|evt_/);
  });
  it("a telemetry sink failure cannot retry an already processed webhook",async()=>{
    vi.stubEnv("AUDIT_METRICS_ENABLED","true");vi.spyOn(console,"info").mockImplementation(()=>{throw new Error("sink down");});
    const processEvent=vi.fn(async()=>"processed" as const);
    const post=createWebhookPost({constructEvent:()=>checkoutCompleted(),processEvent});
    const response=await post(new Request("https://app.example.test/api/stripe/webhook",{method:"POST",body:"raw",headers:{"stripe-signature":"valid"}}));
    expect(response.status).toBe(200);expect(processEvent).toHaveBeenCalledOnce();
  });
});
