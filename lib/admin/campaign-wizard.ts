import "server-only";

import {z} from "zod";

import {
  snapshotAudience,
  type CampaignEligibilitySummary,
  type CampaignQueueDependencies,
  type CampaignQueueResult,
} from "@/lib/admin/campaigns";
import {VARIABLE_TOKENS, type CampaignChannel} from "@/lib/admin/campaign-eligibility";
import {requireAdmin} from "@/lib/auth/authorize";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {
  whatsappTemplatesRepository,
  type WhatsAppTemplateRecord,
  type WhatsAppTemplatesRepository,
} from "@/lib/db/repos/whatsapp-templates";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Programme C-5, part 2. The `/admin/campaigns` wizard's domain layer: the step
 * state a URL carries, the contracts that refuse a campaign before it can be
 * written, and the two database-touching operations the page performs.
 *
 * The wizard is a plain `<form method="get">` carrying its answers in the query
 * string, exactly as `/admin/segments` does — no `'use client'` file, because
 * the repo treats its 40 client components as a budget and a six-step form that
 * re-renders on the server needs no browser state. That is also why every
 * helper below is pure over a `Record<string, string | string[] | undefined>`:
 * the state a step reads is the state the previous step put in the URL, and
 * nothing else.
 *
 * The draft row is created only at the LAST step. `campaigns.segment_id` is
 * `NOT NULL`, so a row written earlier would need a nullable FK — and a
 * half-built campaign in the database is one a reviewer can find.
 */
export const CAMPAIGN_WIZARD_STEPS = ["name", "channel", "template", "variables", "segment", "preview"] as const;
export type CampaignWizardStep = (typeof CAMPAIGN_WIZARD_STEPS)[number];

/**
 * The email source templates `campaignTemplateMap` in `lib/automation/campaign-runner.ts`
 * interprets, minus `membership_renewal`: that key is a synonym of
 * `renewal-reminder` kept for rows written before M3 and there is no label for
 * it in either bundle, so offering it would render a blank option.
 */
export const EMAIL_SOURCE_TEMPLATES = ["renewal-reminder", "member-update"] as const;
export type EmailSourceTemplate = (typeof EMAIL_SOURCE_TEMPLATES)[number];

/** Query-string prefix for one template variable's answer, e.g. `var_headline`. */
export const VARIABLE_PARAM_PREFIX = "var_";

export function variableParamName(variable: string): string {
  return `${VARIABLE_PARAM_PREFIX}${variable}`;
}

export type CampaignWizardState = Readonly<{
  draftId: string;
  step: CampaignWizardStep;
  name: string;
  channel: CampaignChannel;
  template: string | null;
  templateKey: string | null;
  variables: Readonly<Record<string, string>>;
  segmentId: string | null;
}>;

type Query = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const uuid = z.string().uuid();
/** The names a WhatsApp template variable may have; the seeds are all camelCase words. */
const VARIABLE_NAME = /^\w{1,64}$/;

/**
 * Every answer arrives from a `<form method="get">` and is therefore untrusted.
 * Anything unrecognised becomes "unanswered" here rather than reaching the
 * repository, which would refuse it with a ZodError and turn a mistyped link
 * into the page's error state. `createCampaignDraft` parses again — this is the
 * page being kind, not the page being the gate.
 */
export function parseCampaignWizardQuery(query: Query, draftId: string): CampaignWizardState {
  const step = CAMPAIGN_WIZARD_STEPS.find((candidate) => candidate === single(query.step)) ?? CAMPAIGN_WIZARD_STEPS[0];
  const channel: CampaignChannel = single(query.channel) === "whatsapp" ? "whatsapp" : "email";
  const template = (EMAIL_SOURCE_TEMPLATES as readonly string[]).includes(single(query.template))
    ? single(query.template)
    : null;
  const templateKeyValue = single(query.templateKey).slice(0, 100);
  const segmentIdValue = single(query.segmentId);
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith(VARIABLE_PARAM_PREFIX)) continue;
    const name = key.slice(VARIABLE_PARAM_PREFIX.length);
    const answer = single(value).trim().slice(0, 1_000);
    if (!VARIABLE_NAME.test(name) || answer === "") continue;
    variables[name] = answer;
  }
  return {
    draftId,
    step,
    name: single(query.name).trim().slice(0, 140),
    channel,
    template,
    templateKey: templateKeyValue === "" ? null : templateKeyValue,
    variables,
    segmentId: uuid.safeParse(segmentIdValue).success ? segmentIdValue : null,
  };
}

/**
 * The parameters the chosen template declares, in the order the adapter maps
 * them into BODY parameters.
 *
 * Empty for email on purpose: an email campaign's body is rendered from the
 * source template and the recipient's own facts (`displayName`, `renewalDate`),
 * which `snapshotAudience` fills in itself — there is nothing for a human to
 * type, so the variables step skips itself rather than showing an empty legend.
 */
export function templateVariablesFor(
  state: Pick<CampaignWizardState, "channel" | "templateKey">,
  templates: readonly WhatsAppTemplateRecord[],
): readonly string[] {
  if (state.channel !== "whatsapp" || state.templateKey === null) return [];
  return templates.find((template) => template.key === state.templateKey)?.variables ?? [];
}

export function visibleWizardSteps(templateVariables: readonly string[]): readonly CampaignWizardStep[] {
  return templateVariables.length > 0
    ? CAMPAIGN_WIZARD_STEPS
    : CAMPAIGN_WIZARD_STEPS.filter((step) => step !== "variables");
}

export function nextWizardStep(step: CampaignWizardStep, steps: readonly CampaignWizardStep[]): CampaignWizardStep {
  const index = steps.indexOf(step);
  return steps[Math.min(index < 0 ? 0 : index + 1, steps.length - 1)];
}

export function previousWizardStep(step: CampaignWizardStep, steps: readonly CampaignWizardStep[]): CampaignWizardStep {
  const index = steps.indexOf(step);
  return steps[Math.max((index < 0 ? 0 : index) - 1, 0)];
}

/**
 * The first step still missing an answer, or `null` when the wizard is
 * complete. The preview step renders this instead of an eligibility table: a
 * preview built from half a campaign counts the wrong people, and "Create
 * draft" offered against it would write a row nobody could send.
 */
export function wizardBlockingStep(
  state: CampaignWizardState,
  templateVariables: readonly string[],
): CampaignWizardStep | null {
  if (state.name === "") return "name";
  if (state.channel === "whatsapp" ? state.templateKey === null : state.template === null) return "template";
  if (templateVariables.some((variable) => (state.variables[variable] ?? "") === "")) return "variables";
  if (state.segmentId === null) return "segment";
  return null;
}

/**
 * A value a staff member typed into one template-variable field: either a
 * literal or exactly one of the closed token set. The substitution itself lives
 * in `resolveRecipientVariables` (Task 8), which is also what turns an
 * unresolvable value into `missing_variable` at snapshot time rather than into
 * an empty BODY parameter Meta rejects.
 */
export const VARIABLE_TOKEN_HINT = VARIABLE_TOKENS.map((token) => `{{${token}}}`).join(" ");

export const createCampaignDraftSchema = z.object({
  draftId: z.string().uuid(),
  segmentId: z.string().uuid(),
  name: z.string().trim().min(1).max(140),
  channel: z.enum(["email", "whatsapp"]),
  template: z.string().trim().min(1).max(100).nullable().default(null),
  templateKey: z.string().trim().min(1).max(100).nullable().default(null),
  variablesTemplate: z.record(z.string().trim().min(1).max(1_000)).default({}),
}).strict().superRefine((value, context) => {
  // The same two rules `campaigns_email_template_check` and
  // `campaigns_whatsapp_template_check` state in the database, refused here so
  // a missing template is a message rather than a 23514 arriving as a 500 on
  // "Create draft".
  if (value.channel === "email" && value.template === null) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "EMAIL_CAMPAIGN_REQUIRES_TEMPLATE", path: ["template"]});
  }
  if (value.channel === "whatsapp" && value.templateKey === null) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "WHATSAPP_CAMPAIGN_REQUIRES_TEMPLATE_KEY", path: ["templateKey"]});
  }
});

/**
 * The final step's POST body, read back into the shape
 * `createCampaignDraftSchema` parses. Nothing is validated here — the schema is
 * the gate — but the shape has to be assembled somewhere that is NOT the
 * `"use server"` module, because every runtime export of one must be a
 * provably-async function (`tests/unit/server-action-actor-boundary.test.ts`).
 */
export function campaignDraftInput(formData: FormData): Readonly<Record<string, unknown>> {
  const text = (name: string): string | null => {
    const value = formData.get(name);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const variablesTemplate: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(VARIABLE_PARAM_PREFIX) || typeof value !== "string") continue;
    const name = key.slice(VARIABLE_PARAM_PREFIX.length);
    if (!VARIABLE_NAME.test(name) || value.trim() === "") continue;
    variablesTemplate[name] = value.trim();
  }
  return {
    draftId: text("campaignDraft"),
    segmentId: text("segmentId"),
    name: text("name"),
    channel: text("channel") ?? "email",
    template: text("template"),
    templateKey: text("templateKey"),
    variablesTemplate,
  };
}

/**
 * Where the browser goes once a draft exists.
 *
 * The base path arrives as a bound Server Action argument, which is serialized
 * through the client and is therefore client-supplied. So it is an allowlist
 * rather than a sanitiser: this page, no scheme, no host, and no
 * protocol-relative `//` that would turn "Create draft" into an open redirect.
 * Anything else returns `null` and the action simply does not redirect — a
 * campaign that was written must not fail over where it was going to send the
 * reader afterwards.
 */
const CAMPAIGN_BASE_PATH = /^\/(?:en\/|zh\/)?admin\/campaigns$/;

/**
 * True for a value the campaign repository would accept as an id. The detail
 * page asks before it reads, so a mistyped URL is a 404 — the shape every other
 * admin route gives an id that names nothing — rather than the ZodError that a
 * read would raise and the page would have to render as "we could not load".
 */
export function isCampaignId(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

export function campaignDetailPath(basePath: unknown, campaignId: string): string | null {
  if (typeof basePath !== "string" || !CAMPAIGN_BASE_PATH.test(basePath)) return null;
  return uuid.safeParse(campaignId).success ? `${basePath}/${campaignId}` : null;
}

export type CampaignWizardDependencies = Readonly<{
  campaigns: CampaignQueueDependencies;
  templates: Pick<WhatsAppTemplatesRepository, "list">;
}>;

const defaultDependencies: CampaignWizardDependencies = {
  campaigns: campaignsRepository,
  templates: whatsappTemplatesRepository,
};

/**
 * The registry row a WhatsApp campaign may send, or a refusal.
 *
 * S-14 makes `approvedTemplateKeys` fail closed at SEND time, but in mock mode
 * it returns the whole config set — so the wizard cannot use it to decide what
 * to offer without offering, in CI and in preview, keys production will skip. A
 * campaign built on one of those reads `eligible` in the preview and sends
 * nothing, which is the failure mode hardest to tell from a provider outage.
 * The registry's own `status` is the one answer that means the same thing in
 * every environment.
 */
async function approvedTemplate(
  actor: Actor,
  templateKey: string,
  dependencies: CampaignWizardDependencies,
): Promise<WhatsAppTemplateRecord> {
  const record = (await dependencies.templates.list(actor)).find((template) => template.key === templateKey);
  if (!record || record.status !== "approved") throw new Error("TEMPLATE_NOT_APPROVED");
  return record;
}

export type CampaignPreviewInput = Readonly<{
  segmentId: string;
  channel: CampaignChannel;
  templateVariables: readonly string[];
  variablesTemplate: Readonly<Record<string, string>>;
}>;

/**
 * The preview step's counts, computed exactly the way the draft's snapshot will
 * be: one audience query, one classifier, one variable resolution. It is a
 * preview and not a promise — the durable answer is the snapshot on
 * `campaign_recipients` that "Create draft" writes, which is what a second
 * admin reviews and what the send queue drains.
 */
export async function previewCampaignAudience(
  actor: Actor,
  input: CampaignPreviewInput,
  dependencies: CampaignWizardDependencies = defaultDependencies,
): Promise<CampaignEligibilitySummary> {
  requireAdmin(actor);
  const segmentId = uuid.parse(input.segmentId);
  return dependencies.campaigns.transaction(actor, async (store) => {
    const segment = await dependencies.campaigns.getSavedSegment(actor, store, segmentId);
    if (!segment) throw new Error("CAMPAIGN_SEGMENT_NOT_FOUND");
    const audience = await dependencies.campaigns.audienceForSegment(actor, store, segment.filters);
    return snapshotAudience(audience, {
      channel: input.channel,
      templateVariables: input.templateVariables,
      variablesTemplate: input.variablesTemplate,
    }).summary;
  });
}

/**
 * The wizard's last step. Shaped on `queueCampaign` and deliberately different
 * in two places: it writes `status: 'draft'` rather than `queued`, so nothing
 * sends until a second admin approves it (S-7), and it resolves the template's
 * parameters per recipient rather than letting the caller supply them.
 *
 * `draftId` is the idempotency key the URL has carried since the first step, so
 * a double-submitted final step — or a reader who refreshes it — recovers the
 * draft that already exists instead of writing a second one.
 */
export async function createCampaignDraft(
  actor: Actor,
  input: unknown,
  dependencies: CampaignWizardDependencies = defaultDependencies,
): Promise<CampaignQueueResult> {
  requireAdmin(actor);
  const parsed = createCampaignDraftSchema.parse(input);
  // Before the transaction: an unapproved template is a refusal, not a rollback,
  // and holding a transaction open across a second repository's read would make
  // the registry part of the campaign write's lock footprint.
  const template = parsed.channel === "whatsapp" && parsed.templateKey !== null
    ? await approvedTemplate(actor, parsed.templateKey, dependencies)
    : null;
  const {campaigns} = dependencies;
  return campaigns.transaction(actor, async (store) => {
    const segment = await campaigns.getSavedSegment(actor, store, parsed.segmentId);
    if (!segment) throw new Error("CAMPAIGN_SEGMENT_NOT_FOUND");
    const existing = await campaigns.findCampaignByIdempotencyKey(actor, store, parsed.draftId, segment.id);
    if (existing) return {...existing, disposition: "existing" as const};
    const audience = await campaigns.audienceForSegment(actor, store, segment.filters);
    const snapshot = snapshotAudience(audience, {
      channel: parsed.channel,
      templateVariables: template?.variables ?? [],
      variablesTemplate: parsed.variablesTemplate,
    });
    const campaign = await campaigns.createCampaign(actor, store, {
      segmentId: parsed.segmentId,
      name: parsed.name,
      channel: parsed.channel,
      template: parsed.template,
      templateKey: parsed.templateKey,
      variablesTemplate: parsed.variablesTemplate,
      idempotencyKey: parsed.draftId,
      status: "draft",
    });
    if (campaign.disposition === "existing") return campaign;
    await campaigns.insertRecipients(actor, store, campaign.campaignId, snapshot.rows);
    await campaigns.appendAudit(actor, store, campaign.campaignId, {action: "campaign.drafted", ...snapshot.summary});
    // The sendable half, not the snapshot's size: the snapshot also holds
    // everyone the campaign could not reach, and reporting that total would
    // overstate the blast to the admin who is about to submit it for review.
    return {...campaign, recipientCount: snapshot.summary.eligible};
  });
}
