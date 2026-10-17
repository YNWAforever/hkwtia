import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { createApplicationCasesRepository } from "@/lib/db/repos/applications";

const profileId = "member-a";
const applicationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const caseVersion = "33333333-3333-4333-8333-333333333333";
const staff = {
  kind: "staff" as const,
  userId: "staff-auth",
  profileId: "staff-profile",
};

describe("application case facts", () => {
  it("returns applicant, company and acting staff facts for a single review", async () => {
    const renderer = new PgDialect();
    const execute = vi.fn(async (query: unknown) => {
      const text = renderer.sqlToQuery(query as never).sql;
      if (text.includes("FROM audit_events")) {
        return {
          rows: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              created_at: "2026-10-17T01:15:00.000Z",
              actor_type: "staff",
              actor_user_id: "staff-profile",
              actor_name: "Synthetic Staff",
              metadata: {
                note: "Synthetic review note",
                case: {
                  applicationId,
                  caseVersion,
                  ownerProfileId: "staff-profile",
                  dueAt: "2026-10-18T06:30:00.000Z",
                  missingFields: ["companyWebsite"],
                  nextActionCode: "await_documents",
                },
              },
            },
          ],
        };
      }
      return {
        rows: [
          {
            id: applicationId,
            applicant_user_id: profileId,
            display_name: "Synthetic Applicant",
            email: "applicant@example.test",
            phone: "+852 5555 0101",
            job_title: "Founder",
            locale: "en",
            onboarding_state: "company",
            company_id: companyId,
            company_name: "Synthetic Brand",
            company_legal_name: "Synthetic Company Limited",
            company_website: "https://synthetic.example.test",
            company_industry: "Technology",
            company_size_band: "small",
            company_description: "Synthetic company description",
            plan_code: "startup",
            status: "pending_review",
            current_step: "review",
            created_at: "2026-10-16T01:00:00.000Z",
            updated_at: "2026-10-17T01:00:00.000Z",
            membership_id: null,
            membership_status: null,
            attempt_id: null,
            attempt_state: null,
            context: {
              applicationId,
              caseVersion,
              ownerProfileId: "staff-profile",
              dueAt: "2026-10-18T06:30:00.000Z",
              missingFields: ["companyWebsite"],
              nextActionCode: "await_documents",
            },
          },
        ],
      };
    });
    const repo = createApplicationCasesRepository(
      async () => ({ execute }) as never,
    );

    const record = await repo.getApplicationCase(staff, applicationId);
    expect(record?.profile).toMatchObject({
      email: "applicant@example.test",
      phone: "+852 5555 0101",
      jobTitle: "Founder",
      locale: "en",
      onboardingState: "company",
    });
    expect(record?.company).toMatchObject({
      id: companyId,
      legalName: "Synthetic Company Limited",
      displayName: "Synthetic Brand",
      website: "https://synthetic.example.test",
      industry: "Technology",
      sizeBand: "small",
      description: "Synthetic company description",
    });
    expect(record?.application).toMatchObject({
      createdAt: "2026-10-16T01:00:00.000Z",
      updatedAt: "2026-10-17T01:00:00.000Z",
    });
    expect(record?.timeline[0]).toMatchObject({
      actorUserId: "staff-profile",
      actorName: "Synthetic Staff",
    });
  });
});
