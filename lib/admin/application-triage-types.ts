import type { ApplicationTriage } from "@/lib/ai/application-triage";
export type ApplicationTriageSnapshot = Readonly<{
  applicationId: string;
  locale: "en" | "zh-HK";
  caseVersion: string;
  ownerId: string | null;
  dueAt: string | null;
  factsHash: string;
  triage: ApplicationTriage;
  states: Readonly<{
    application: string;
    membership: string | null;
    payment: string | null;
  }>;
}>;
