import "server-only";

import type {OwnedApplicationPageInput} from "@/lib/membership/owned-application-reader";
import {z} from "zod";

import {applicationsRepository} from "@/lib/db/repos/applications";
import type {MembershipApplication} from "@/lib/db/server-schema";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export type MemberApplicationStatus = MembershipApplication["status"];
export type MemberApplicationStep = MembershipApplication["currentStep"];
export type MemberApplicationMissing = "profile" | "company";
export type MemberApplicationNextAction = "resume" | "billing" | "wait" | "complete" | "new";

export type MemberApplicationView = Readonly<{
  id: string;
  planCode: MembershipApplication["planCode"];
  status: MemberApplicationStatus;
  step: MemberApplicationStep;
  createdAt: string;
  updatedAt: string;
  missing: readonly MemberApplicationMissing[];
  nextAction: MemberApplicationNextAction;
}>;

type ApplicationRecord = Pick<
  MembershipApplication,
  "id" | "applicantUserId" | "planCode" | "companyId" | "currentStep" | "status" | "createdAt" | "updatedAt"
>;

type ApplicationReader = Readonly<{
  listOwned: (actor: Actor) => Promise<readonly ApplicationRecord[]>;
  getOwnedById: (actor: Actor, id: string) => Promise<ApplicationRecord | null>;
  listOwnedPage: (actor: Actor, input: OwnedApplicationPageInput) => Promise<{items: readonly ApplicationRecord[]; nextCursor: string | null}>;
}>;

export type PortalApplicationDependencies = Readonly<{
  applications: ApplicationReader;
}>;

const defaultDependencies: PortalApplicationDependencies = {
  applications: applicationsRepository,
};

function missingFor(application: ApplicationRecord): readonly MemberApplicationMissing[] {
  if (application.status !== "draft") return [];
  if (application.currentStep === "profile") return ["profile"];
  if (application.currentStep === "company" && application.companyId === null) return ["company"];
  return [];
}

function nextActionFor(application: ApplicationRecord): MemberApplicationNextAction {
  switch (application.status) {
    case "draft":
      return "resume";
    case "pending_payment":
      return "billing";
    case "pending_review":
      return "wait";
    case "completed":
      return "complete";
    case "abandoned":
      return "new";
  }
}

function project(application: ApplicationRecord): MemberApplicationView {
  return {
    id: application.id,
    planCode: application.planCode,
    status: application.status,
    step: application.currentStep,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    missing: missingFor(application),
    nextAction: nextActionFor(application),
  };
}

function ownedBy(actor: Extract<Actor, {kind: "member"}>, applications: readonly ApplicationRecord[]) {
  return applications.filter((application) => application.applicantUserId === actor.profileId);
}

export async function getMemberApplications(
  actor: Actor,
  inputDependencies: PortalApplicationDependencies = defaultDependencies,
): Promise<readonly MemberApplicationView[]> {
  requireMember(actor);
  const applications = await inputDependencies.applications.listOwned(actor);
  return ownedBy(actor, applications).map(project);
}

export async function getMemberApplication(
  actor: Actor,
  id: string,
  inputDependencies: PortalApplicationDependencies = defaultDependencies,
): Promise<MemberApplicationView | null> {
  requireMember(actor);
  if (!z.string().uuid().safeParse(id).success) return null;
  const application = await inputDependencies.applications.getOwnedById(actor, id);
  return application && application.applicantUserId === actor.profileId ? project(application) : null;
}

/** Paged portal history; the legacy unbounded helper remains available to callers. */
export async function getMemberApplicationsPage(
  actor: Actor,
  input: OwnedApplicationPageInput = {},
  inputDependencies: PortalApplicationDependencies = defaultDependencies,
) {
  requireMember(actor);
  const page = await inputDependencies.applications.listOwnedPage(actor, input);
  return {items: ownedBy(actor, page.items).map(project), nextCursor: page.nextCursor};
}
