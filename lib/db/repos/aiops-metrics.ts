import "server-only";

import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {aiopsMonthlyMetrics} from "@/lib/db/schema-core";

export type AiOpsMetricsRepository = Readonly<{
  refresh(actor: AutomationRepositoryActor): Promise<void>;
}>;

type DatabaseLoader = () => Promise<Database>;

export function createAiOpsMetricsRepository(
  loadDatabase: DatabaseLoader = getDb,
): AiOpsMetricsRepository {
  return {
    async refresh(actor: AutomationRepositoryActor): Promise<void> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      await database
        .refreshMaterializedView(aiopsMonthlyMetrics)
        .concurrently();
    },
  };
}

export const aiOpsMetricsRepository = createAiOpsMetricsRepository();
