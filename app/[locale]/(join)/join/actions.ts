"use server";

import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";
import {z} from "zod";

import type {JoinFormState} from "@/components/join/join-form";
import type {AppLocale} from "@/i18n/routing";
import {auth} from "@/lib/auth/server";
import {requireActor} from "@/lib/auth/actor";
import {companiesRepository} from "@/lib/db/repos/companies";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {companySchema, profileSchema} from "@/lib/membership/join-schema";
import {completeApplication, startJoin} from "@/lib/membership/join-service";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {absoluteUrl, localizedPath} from "@/lib/urls";

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

function statusFor(next: string) {
  if (next === "complete") return "complete";
  if (next === "review") return "review";
  return "checkout";
}

export async function requestMagicLink(locale: AppLocale, plan: PlanCode, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  getPlan(plan);
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return formError(locale, "email", "errors.email");
  const t = await getTranslations({locale, namespace: "Join"});
  const callbackURL = absoluteUrl(nextUrl(locale, "/join", {plan}));

  try {
    const result = await auth.signIn.magicLink({email: email.data, callbackURL});
    if (result.error) return {message: t("errors.auth")};
  } catch {
    return {message: t("errors.auth")};
  }

  redirect(nextUrl(locale, "/join", {plan, sent: "1"}));
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
    const application = applicationId ? {applicationId} : await startJoin(actor, {plan});
    const id = "applicationId" in application ? application.applicationId : applicationId;
    const companyPlan = ["startup", "corporate"].includes(plan);
    if (companyPlan) redirect(nextUrl(locale, "/join/company", {plan, application: id}));

    const result = await completeApplication(actor, {plan, applicationId: id, profile: parsed.data, company: null});
    redirect(nextUrl(locale, "/join", {plan, application: result.applicationId, status: statusFor(result.next)}));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {message: t("errors.save")};
  }
}

export async function saveCompany(locale: AppLocale, plan: PlanCode, applicationId: string, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  if (!["startup", "corporate"].includes(plan)) return formError(locale, "companyId", "errors.companyNotAllowed");
  const parsed = companySchema.safeParse({
    id: formData.get("companyId"),
    legalName: formData.get("legalName"),
    displayName: formData.get("companyDisplayName"),
    website: formData.get("website") || null,
    industry: formData.get("industry") || null,
    sizeBand: formData.get("sizeBand") || null,
    description: formData.get("description") || null,
  });
  if (!parsed.success || !parsed.data.id) {
    const schemaField = parsed.success ? "companyId" : (parsed.error.issues[0]?.path[0]?.toString() ?? "companyId");
    const field = schemaField === "id" ? "companyId" : schemaField === "displayName" ? "companyDisplayName" : schemaField;
    return formError(locale, field);
  }
  const t = await getTranslations({locale, namespace: "Join"});

  try {
    const actor = await requireActor();
    if (actor.kind !== "member") return {message: t("errors.auth")};
    const company = await companiesRepository.getById(actor, parsed.data.id);
    if (!company) return {fieldErrors: {companyId: t("errors.company")}};
    await companiesRepository.update(actor, company.id, {
      legalName: parsed.data.legalName,
      displayName: parsed.data.displayName,
      website: parsed.data.website,
      industry: parsed.data.industry,
      sizeBand: parsed.data.sizeBand,
      description: parsed.data.description,
    });
    const profile = await profilesRepository.getById(actor, actor.userId);
    if (!profile) return {message: t("errors.profile")};
    const result = await completeApplication(actor, {plan, applicationId, profile: {
      displayName: profile.displayName,
      phone: profile.phone,
      jobTitle: profile.jobTitle,
      locale: profile.locale,
    }, company: parsed.data});
    redirect(nextUrl(locale, "/join", {plan, application: result.applicationId, status: statusFor(result.next)}));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return {message: t("errors.save")};
  }
}
