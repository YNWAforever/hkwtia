import {and, eq, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {jobs as jobsTable, type Job} from "@/lib/db/server-schema";
import {getDb, requireSystem} from "@/lib/db/repos/common";

export type JobClaimResult = "claimed" | "duplicate";

export const jobsRepository = {
  async getByRunKey(actor: Actor, runKey: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db.select().from(jobsTable).where(and(eq(jobsTable.runKey, runKey), sql`true`)).limit(1);
    return rows[0] ?? null;
  },

  async claim(actor: Actor, runKey: string, kind: string): Promise<JobClaimResult> {
    requireSystem(actor);
    const db = await getDb();
    const existing = await db.select({id: jobsTable.id}).from(jobsTable).where(and(eq(jobsTable.runKey, runKey), sql`true`)).limit(1);
    if (existing.length > 0) return "duplicate";
    try {
      await db.insert(jobsTable).values({runKey, kind, state: "processing", attemptCount: 0}).returning({id: jobsTable.id});
      return "claimed";
    } catch (error) {
      // The unique run_key constraint is the final arbiter for concurrent webhook retries.
      if (error && typeof error === "object" && "code" in error && (error as {code?: string}).code === "23505") return "duplicate";
      throw error;
    }
  },

  async complete(actor: Actor, runKey: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db
      .update(jobsTable)
      .set({state: "completed", completedAt: new Date(), updatedAt: new Date()})
      .where(and(eq(jobsTable.runKey, runKey), sql`true`))
      .returning();
    return rows[0] ?? null;
  },

  async fail(actor: Actor, runKey: string, errorMessage: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db
      .update(jobsTable)
      .set({state: "failed", lastError: errorMessage, updatedAt: new Date()})
      .where(and(eq(jobsTable.runKey, runKey), sql`true`))
      .returning();
    return rows[0] ?? null;
  },
};

export const jobsRepo = jobsRepository;

export const jobs = jobsRepository;
