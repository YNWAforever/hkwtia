"use server";

import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";
import {z} from "zod";

import type {JoinFormState} from "@/components/join/join-form";
import type {AppLocale} from "@/i18n/routing";
import {auth} from "@/lib/auth/server";
import {requireActor} from "@/lib/auth/actor";
import {serverEnv} from "@/lib/config/env";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {companiesRepository} from "@/lib/db/repos/companies";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {buildJoinCallback, destinationForJoin, parseJoinContinuation, type JoinContinuation} from "@/lib/membership/join-navigation";
import {companySchema, profileSchema} from "@/lib/membership/join-schema";
import {completeApplication, startJoin} from "@/lib/membership/join-service";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

const emailSchema = z.string().trim().email();

function nextUrl(locale: AppLocale, pathname: string, values: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) search.set(key, value);
  const query = search.toString();
  return `${localizedPath(locale, pathname)}${query ? `?${query}` : ""}`;
}

async function formError(locale: AppLocale, field: string, key = "errors.required"): Promise<JoinFormState> {
  const t = await getTranslations({locale, namespace: "Join"});
  return {fieldErrors: {[field]: t(key)}};
}

export async function requestMagicLink(locale: AppLocale, plan: PlanCode, continuation: JoinContinuation | null, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  getPlan(plan);
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return formError(locale, "email", "errors.email");
  const t = await getTranslations({locale, namespace: "Join"});
  const next = continuation == null ? null : parseJoinContinuation(continuation, locale);
  if (continuation != null && !next) return {message: t("errors.auth")};
  const callbackURL = buildJoinCallback(serverEnv().appUrl, locale, plan, next);

  try {
    const result = await auth.signIn.magicLink({email: email.data, callbackURL});
    if (result.error) return {message: t("errors.auth")};
  } catch {
    return {message: t("errors.auth")};
  }

  redirect(nextUrl(locale, "/join", {plan, sent: "1", next}));
}

export async function saveProfile(locale: AppLocale, plan: PlanCode, applicationId: string | null, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone") || null,
    jobTitle: formData.get("jobTitle") || null,
    locale,
  });
  if (!parsed.success) {
    return formError(locale, parsed.error.issues[0]?.path[0]?.toString() ?? "displayName");
  }
  const t = await getTranslations({locale, namespace: "Join"});

  try {
    const actor = await requireActor();
    if (actor.kind !== "member") return {message: t("errors.auth")};
    const existing = await profilesRepository.getById(actor, actor.userId);
    if (existing) {
      await profilesRepository.update(actor, actor.userId, {...parsed.data, onboardingState: "profile"});
    } else {
      await profilesRepository.ensure(actor, {id: actor.userId, ...parsed.data, onboardingState: "profile"});
    }
    const application = await startJoin(actor, {plan, applicationId});
    const id = application.applicationId;
    const companyPlan = ["startup", "corporate"].includes(plan);
    if (companyPlan) {
      await applicationsRepository.update(actor, id, {currentStep: "company"});
      const destination = destinationForJoin(locale, plan, id, "company");
      redirect(destination.href!);
    }

    const result = await completeApplication(actor, {plan, applicationId: id, profile: parsed.data, company: null});
    redirect(nextUrl(locale, "/join", {plan, application: result.applicationId}));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {message: t("errors.save")};
  }
}

export async function saveCompany(locale: AppLocale, plan: PlanCode, applicationId: string, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  if (!["startup", "corporate"].includes(plan)) return formError(locale, "legalName", "errors.companyNotAllowed");
  const parsed = companySchema.safeParse({
    legalName: formData.get("legalName"),
    displayName: formData.get("companyDisplayName"),
    website: formData.get("website") || null,
    industry: formData.get("industry") || null,
    sizeBand: formData.get("sizeBand") || null,
    description: formData.get("description") || null,
  });
  if (!parsed.success) {
    const schemaField = parsed.error.issues[0]?.path[0]?.toString() ?? "legalName";
    const field = schemaField === "displayName" ? "companyDisplayName" : schemaField;
    return formError(locale, field);
  }
  const t = await getTranslations({locale, namespace: "Join"});

  try {
    const actor = await requireActor();
    if (actor.kind !== "member") return {message: t("errors.auth")};
    const application = await applicationsRepository.getById(actor, applicationId);
    if (!application || application.planCode !== plan || application.applicantUserId !== actor.userId) return {message: t("errors.save")};
    const company = application.companyId
      ? await companiesRepository.update(actor, application.companyId, parsed.data)
      : await companiesRepository.createForApplication(actor, applicationId, parsed.data);
    if (!company) return {message: t("errors.save")};
    const profile = await profilesRepository.getById(actor, actor.userId);
    if (!profile) return {message: t("errors.profile")};
    const result = await completeApplication(actor, {plan, applicationId, profile: {
      displayName: profile.displayName,
      phone: profile.phone,
      jobTitle: profile.jobTitle,
      locale: profile.locale,
    }, company: {...parsed.data, id: company.id}});
    redirect(nextUrl(locale, "/join", {plan, application: result.applicationId}));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {message: t("errors.save")};
  }
}
