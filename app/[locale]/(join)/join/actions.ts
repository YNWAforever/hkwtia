"use server";

import {getTranslations} from "next-intl/server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {z} from "zod";

import type {JoinFormState} from "@/components/join/join-form";
import type {AppLocale} from "@/i18n/routing";
import {auth} from "@/lib/auth/server";
import {checkAuthSend} from "@/lib/auth/rate-limit";
import {requireActor} from "@/lib/auth/actor";
import {appEnv} from "@/lib/config/env";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {companiesRepository} from "@/lib/db/repos/companies";
import {contactWriterActor, contactsRepository} from "@/lib/db/repos/contacts";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {buildJoinCallback, destinationForJoin, parseJoinContinuation, type JoinContinuation} from "@/lib/membership/join-navigation";
import {applicationOutcome, BR_UPLOAD_LIMITS, membershipTrack, planCollectsCompany} from "@/config/membership-journey";
import {saveOrganisationApplication} from "@/lib/db/repos/organisation-applications";
import {BrDocumentError, storeBusinessRegistration} from "@/lib/membership/br-document";
import {companySchema, profileSchema} from "@/lib/membership/join-schema";
import {whatsappConsentFields} from "@/lib/whatsapp/consent";
import {completeApplication, startJoin} from "@/lib/membership/join-service";
import {attributeJoinInvite} from "@/lib/membership/join-invite-attribution";
import type {JoinStep} from "@/lib/membership/onboarding";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {createCheckoutSession} from "@/lib/billing/checkout-service";
import {policyAcceptanceEnabled,requireCurrentMembershipPolicy} from "@/lib/membership/policy";
import {requirePolicyAcceptanceForApplication} from "@/lib/membership/policy-acceptance";
import {recordPolicyAcceptance} from "@/lib/db/repos/membership-policy-acceptances";
import {loadPendingJoinBillingState} from "@/lib/membership/join-billing-state";
import {type BillingInterval} from "@/lib/membership/catalog";
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

function defaultBillingInterval(plan: PlanCode): BillingInterval {
  return applicationOutcome(plan).billingInterval;
}

const organisationContactSchema = z.object({
  tier: z.enum(["corporate", "patron"]),
  primaryName: z.string().trim().min(1).max(160),
  primaryEmail: z.string().trim().email().max(254),
  primaryPhone: z.string().trim().max(64).nullable(),
  secondaryName: z.string().trim().min(1).max(160),
  secondaryEmail: z.string().trim().email().max(254),
  secondaryPhone: z.string().trim().max(64).nullable(),
});

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// completeApplication() already knows exactly where the applicant belongs next --
// redirect off that typed outcome directly instead of bouncing everyone back through
// the generic /join?plan=...&application=... page to re-derive it.
function redirectToOutcome(locale: AppLocale, plan: PlanCode, result: {applicationId: string; next: JoinStep; membershipId?: string}): never {
  switch (result.next) {
    case "profile":
    case "company":
      redirect(destinationForJoin(locale, plan, result.applicationId, result.next).href!);
    case "checkout":
      redirect(nextUrl(locale, "/join/checkout", {membership_id: result.membershipId}));
    case "review":
    case "complete":
      // "review" and "complete" both land on /join/complete, which renders three
      // different projections (processing/review/active) off the membership's real
      // status -- routing both outcomes here is intentional, not a placeholder.
      redirect(nextUrl(locale, "/join/complete", {membership_id: result.membershipId}));
    default:
      // Exhaustiveness check: if a new JoinStep value is added, this will fail
      // to compile unless it's handled above.
      const _exhaustive: never = result.next;
      throw new Error(`Unhandled JoinStep: ${_exhaustive}`);
  }
}

/** Explicit join POST. A page refresh or prefetch cannot create a draft. */
export async function resumeJoinAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale") === "zh-HK" ? "zh-HK" : "en";
  const planValue = formData.get("plan");
  if (typeof planValue !== "string") redirect(localizedPath(locale, "/membership"));
  let plan: PlanCode;
  try { plan = getPlan(planValue).code; } catch { redirect(localizedPath(locale, "/membership")); }
  const applicationId = formData.get("applicationId");
  const companyId = formData.get("companyId");
  const actor = await requireActor();
  if (actor.kind !== "member") throw new Error("UNAUTHORIZED");
  const result = await startJoin(actor, {
    plan,
    applicationId: typeof applicationId === "string" && applicationId ? applicationId : null,
    companyId: typeof companyId === "string" && companyId ? companyId : null,
    newApplication: formData.get("intent") === "new",
  });
  const destination = destinationForJoin(locale, plan, result.applicationId, result.next);
  if (destination.kind === "page") redirect(destination.href!);
  const membership = await membershipsRepository.getByApplicationId(actor, result.applicationId);
  if (!membership) redirect(`${localizedPath(locale, "/join")}?${new URLSearchParams({plan, application: result.applicationId, error: "status"})}`);
  redirect(nextUrl(locale, result.next === "checkout" ? "/join/checkout" : "/join/complete", {membership_id: membership.id}));
}

export async function requestMagicLink(locale: AppLocale, plan: PlanCode | null, continuation: JoinContinuation | null, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  if (plan != null) getPlan(plan);
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return formError(locale, "email", "errors.email");
  const t = await getTranslations({locale, namespace: "Join"});
  const next = continuation == null ? null : parseJoinContinuation(continuation, locale);
  if (continuation != null && !next) return {message: t("errors.auth")};
  if (plan == null && next == null) return {message: t("errors.auth")};
  // `auth.signIn.magicLink` fetches the upstream auth service directly, so it
  // never passes through our /api/auth catch-all. The shared guard has to be
  // applied here too or this path stays an unauthenticated email amplifier.
  const send = await checkAuthSend({
    ip: clientIpFromHeaders(await headers()),
    email: email.data,
  });
  if (!send.allowed) return {message: t(send.unavailable ? "errors.limiterUnavailable" : "errors.rateLimited")};
  const applicationValue = formData.get("application");
  const applicationId = typeof applicationValue === "string" && applicationValue ? applicationValue : null;
  let callbackURL: string;
  try { callbackURL = buildJoinCallback(appEnv().appUrl, locale, plan, next, applicationId); }
  catch { return {message: t("errors.auth")}; }

  try {
    const result = await auth.signIn.magicLink({email: email.data, callbackURL});
    if (result.error) return {message: t("errors.auth")};
  } catch {
    return {message: t("errors.auth")};
  }

  redirect(nextUrl(locale, "/join", {plan, sent: "1", next, application: applicationId}));
}

export async function saveProfile(locale: AppLocale, plan: PlanCode, applicationId: string | null, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone") || null,
    jobTitle: formData.get("jobTitle") || null,
    locale,
    whatsappNumber: formData.get("whatsappNumber") || null,
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0]?.toString() ?? "displayName";
    return formError(locale, field, field === "whatsappNumber" ? "errors.whatsappNumber" : "errors.required");
  }
  const t = await getTranslations({locale, namespace: "Join"});

  try {
    const actor = await requireActor();
    if (actor.kind !== "member") return {message: t("errors.auth")};
    // Validate a resumed draft before profile/consent writes or contact linking.
    const resumed = applicationId ? await startJoin(actor, {plan, applicationId}) : null;
    if(policyAcceptanceEnabled()){
      const policy=requireCurrentMembershipPolicy();
      if(formData.get("policyAccepted")!=="on"){
        if(!applicationId)return {message:t("policy.required")};
        await requirePolicyAcceptanceForApplication(actor,applicationId);
      }else if(formData.get("policyVersion")!==policy.version)return {message:t("policy.stale")};
    }
    const existing = await profilesRepository.getById(actor, actor.profileId);
    // Programme D-7: the join step is the consent source; provenance is stamped
    // here, and completeApplication() only forwards name/locale afterwards.
    const consent = whatsappConsentFields({optIn: parsed.data.whatsappOptIn, source: "join"});
    // This marker tracks the validated profile step; membership/payment gates remain separate.
    const profileWrite = {...parsed.data, ...consent, onboardingState: "complete" as const};
    const saved = existing
      ? await profilesRepository.update(actor, actor.profileId, profileWrite)
      : await profilesRepository.ensure(actor, {id: actor.profileId, ...profileWrite});
    // Programme C-4 / plan S-16. The second of the two writes that can change a
    // member's matchable identity (the other is the portal profile save). A
    // prospect who wrote in on WhatsApp, or left an interest form, becomes the
    // same person as this profile here.
    //
    // Fire-and-forget: an applicant mid-join must never see `errors.save`
    // because a merge failed, on a profile the repository already wrote. The
    // number comes from the parsed form because `profileSchema` has already
    // normalised it; the address from the saved row, since the join form never
    // asks for one.
    void contactsRepository.linkProfile(contactWriterActor("import"), {
      profileId: actor.profileId,
      email: saved?.email ?? existing?.email ?? null,
      phoneE164: parsed.data.whatsappNumber,
    }).catch(() => undefined);
    const application = resumed ?? await startJoin(actor, {plan, applicationId});
    const id = application.applicationId;
    if(policyAcceptanceEnabled()&&formData.get("policyAccepted")==="on")await recordPolicyAcceptance(actor,{applicationId:id,policyVersion:String(formData.get("policyVersion"))});
    const companyPlan = planCollectsCompany(plan);
    if (companyPlan) {
      await applicationsRepository.update(actor, id, {currentStep: "company"});
      const destination = destinationForJoin(locale, plan, id, "company");
      redirect(destination.href!);
    }

    // No interval-picker UI exists yet (out of scope here) -- this mirrors the derivation
    // completeApplication() used to make internally, now explicit at the caller since
    // billingInterval is a real, validated input rather than something the server derives alone.
    const billingInterval = defaultBillingInterval(plan);
    const result = await completeApplication(actor, {plan, applicationId: id, billingInterval, profile: parsed.data, company: null});
    // After the application is saved and before the redirect throws; never throws itself.
    await attributeJoinInvite(actor, result.applicationId);
    redirectToOutcome(locale, plan, result);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if(error instanceof Error&&error.message.startsWith("MEMBERSHIP_POLICY_"))return {message:t(error.message==="MEMBERSHIP_POLICY_VERSION_STALE"?"policy.stale":"policy.required")};
    return {message: t("errors.save")};
  }
}

export async function saveCompany(locale: AppLocale, plan: PlanCode, applicationId: string, _state: JoinFormState, formData: FormData): Promise<JoinFormState> {
  if (!planCollectsCompany(plan)) return formError(locale, "legalName", "errors.companyNotAllowed");
  const organisationParsed = membershipTrack(plan) === "organisation"
    ? organisationContactSchema.safeParse({
      tier: formData.get("tier"),
      primaryName: formData.get("primaryName"),
      primaryEmail: formData.get("primaryEmail"),
      primaryPhone: emptyToNull(formData.get("primaryPhone")),
      secondaryName: formData.get("secondaryName"),
      secondaryEmail: formData.get("secondaryEmail"),
      secondaryPhone: emptyToNull(formData.get("secondaryPhone")),
    })
    : null;
  if (organisationParsed && !organisationParsed.success) {
    const field = organisationParsed.error.issues[0]?.path[0]?.toString() ?? "primaryName";
    const emailField = field === "primaryEmail" || field === "secondaryEmail";
    return formError(locale, field, field === "tier" ? "errors.tier" : emailField ? "errors.email" : "errors.required");
  }
  if (organisationParsed?.success && organisationParsed.data.tier !== plan) return formError(locale, "tier", "errors.tier");
  const displayName = formData.get("companyDisplayName");
  const parsed = companySchema.safeParse({
    legalName: formData.get("legalName"),
    displayName: displayName === null || (typeof displayName === "string" && !displayName.trim())
      ? formData.get("legalName") : displayName,
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
    if (!application || application.planCode !== plan || application.applicantUserId !== actor.profileId) return {message: t("errors.save")};
    if(policyAcceptanceEnabled()){
      if(formData.get("policyAccepted")==="on")await recordPolicyAcceptance(actor,{applicationId,policyVersion:String(formData.get("policyVersion"))});
      else await requirePolicyAcceptanceForApplication(actor,applicationId);
    }
    // Store the registration before the company write so a rejected file does not
    // create a company row. Production refuses a stub: the bytes would be gone.
    let storedBr: Awaited<ReturnType<typeof storeBusinessRegistration>> | null = null;
    if (organisationParsed?.success) {
      const file = formData.get("businessRegistration");
      if (!(file instanceof File) || file.size === 0) return formError(locale, "businessRegistration", "errors.brRequired");
      if (file.size > BR_UPLOAD_LIMITS.maxBytes) return formError(locale, "businessRegistration", "errors.brSize");
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        storedBr = await storeBusinessRegistration({applicationId, fileName: file.name || "registration", bytes});
      } catch (error) {
        if (!(error instanceof BrDocumentError)) throw error;
        const key = error.code === "BR_TOO_LARGE" ? "errors.brSize"
          : error.code === "BR_REQUIRED" ? "errors.brRequired"
          : error.code === "BR_STORAGE_FAILED" ? "errors.brStorage"
          : "errors.brType";
        return formError(locale, "businessRegistration", key);
      }
      if (storedBr.status === "pending_provider" && process.env.VERCEL_ENV === "production") {
        return formError(locale, "businessRegistration", "errors.brStorage");
      }
    }
    const company = application.companyId
      ? await companiesRepository.update(actor, application.companyId, parsed.data)
      : await companiesRepository.createForApplication(actor, applicationId, parsed.data);
    if (!company) return {message: t("errors.save")};
    if (organisationParsed?.success && storedBr) {
      const contacts = organisationParsed.data;
      await saveOrganisationApplication(actor, {
        applicationId,
        tier: contacts.tier,
        primaryName: contacts.primaryName,
        primaryEmail: contacts.primaryEmail,
        primaryPhone: contacts.primaryPhone,
        secondaryName: contacts.secondaryName,
        secondaryEmail: contacts.secondaryEmail,
        secondaryPhone: contacts.secondaryPhone,
        br: storedBr,
      });
    }
    const profile = await profilesRepository.getById(actor, actor.profileId);
    if (!profile) return {message: t("errors.profile")};
    const billingInterval = defaultBillingInterval(plan);
    const result = await completeApplication(actor, {plan, applicationId, billingInterval, profile: {
      displayName: profile.displayName,
      phone: profile.phone,
      jobTitle: profile.jobTitle,
      locale: profile.locale,
    }, company: {...parsed.data, id: company.id}});
    await attributeJoinInvite(actor, result.applicationId);
    redirectToOutcome(locale, plan, result);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if(error instanceof Error&&error.message.startsWith("MEMBERSHIP_POLICY_"))return {message:t(error.message==="MEMBERSHIP_POLICY_VERSION_STALE"?"policy.stale":"policy.required")};
    if (error instanceof BrDocumentError) return formError(locale, "businessRegistration", "errors.brStorage");
    return {message: t("errors.save")};
  }
}

/** Only an explicit POST may claim or resume a payable membership attempt. */
export async function beginMembershipCheckoutAction(formData: FormData): Promise<void> {
  const membershipId = z.string().uuid().safeParse(formData.get("membershipId"));
  const locale = z.enum(["en", "zh-HK"]).safeParse(formData.get("locale"));
  if (!membershipId.success || !locale.success) throw new Error("INVALID_CHECKOUT_REQUEST");
  const actor = await requireActor();
  const state = await loadPendingJoinBillingState(actor, membershipId.data);
  if (!state) throw new Error("CHECKOUT_NOT_AVAILABLE");
  let session:{url:string};
  try{
    if(policyAcceptanceEnabled()&&formData.get("policyAccepted")==="on")await recordPolicyAcceptance(state.actor,{applicationId:state.application.id,policyVersion:String(formData.get("policyVersion"))});
    session=await createCheckoutSession(state.actor,state.membership.id,locale.data);
  }catch(error){
    if(error instanceof Error&&error.message.startsWith("MEMBERSHIP_POLICY_"))redirect(localizedPath(locale.data,"/join/checkout")+"?"+new URLSearchParams({membership_id:state.membership.id,policyError:error.message==="MEMBERSHIP_POLICY_VERSION_STALE"?"stale":"required"}));
    throw error;
  }
  redirect(session.url);
}
