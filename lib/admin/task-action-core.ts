import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {staffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

type Resolver = Pick<typeof staffTasksRepository, "resolve">;

/** Actor-taking core, kept out of the "use server" module (CLAUDE.md boundary #3). */
export async function resolveStaffTask(actor: Actor, taskId: unknown, deps: Resolver = staffTasksRepository) {
  requireAdmin(actor);
  const id = z.string().uuid().parse(taskId);
  return deps.resolve(actor, id);
}
