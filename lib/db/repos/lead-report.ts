import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {contactActivities, contacts, joinInvites, membershipPlans, memberships, profiles} from "@/lib/db/server-schema";
import {
  CONTACT_SOURCES,
  CONTACT_STAGES,
  type ContactSource,
  type ContactStage,
} from "@/lib/db/repos/contacts";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {membershipPlansRepository, type PersistedMembershipPlan} from "@/lib/db/repos/membership-plans";
import type {PlanCode} from "@/lib/membership/catalog";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Phase E, Task 10: the lead conversion report. Read-only SQL aggregates.
 *
 * WINDOW. One choice, applied consistently: the funnel (by source, and the
 * leads / members columns per owner) is bounded by `contacts.created_at`; every
 * invite metric (sent, opened, applied, paid, median, invited-vs-joined, and the
 * invite columns per owner) is bounded by `join_invites.created_at`. So "last 30
 * days" means "leads created in 30 days" and "invites sent in 30 days"; an invite
 * sent today to a year-old lead counts as an invite, not as a new lead.
 *
 * PAID. An invite is "paid" when its application has an ACTIVE membership on a
 * plan that is not free. A free (Community) join is active without paying, so it
 * is reported on its own as "joined (free)" (final review I2). The membership row
 * is inserted at submit as pending_payment, so its `created_at` measures invite
 * to APPLICATION; the invite-to-paid time instead runs from
 * `join_invites.created_at` to the contact's first `became_member` activity at or
 * after it, which is written where the membership becomes active.
 *
 * DISTINCT. "Sent" and "opened" count leads (distinct contacts), so a re-minted
 * link to the same lead is one lead invited; "applied", "paid" and "joined
 * (free)" count distinct applications.
 *
 * ESTIMATE (spec E-6). Joined count per plan x that plan's annual list price. It
 * is not reconciled with Stripe, so the page labels it an estimate.
 */
export type LeadReportWindow = "30" | "90" | "180" | "all";
const WINDOWS: readonly LeadReportWindow[] = ["30", "90", "180", "all"];

/** Anything that is not exactly one known window means the default, so a hand-edited URL still renders. */
export function parseLeadReportWindow(value: unknown): LeadReportWindow {
  return typeof value === "string" && (WINDOWS as readonly string[]).includes(value) ? value as LeadReportWindow : "90";
}

export type LeadReportOwnerRow = Readonly<{
  ownerProfileId: string | null;
  ownerName: string | null;
  leads: number;
  invitesSent: number;
  invitesOpened: number;
  applications: number;
  members: number;
}>;

export type LeadReport = Readonly<{
  bySource: Record<ContactSource, Record<ContactStage, number>>;
  byOwner: readonly LeadReportOwnerRow[];
  invites: {
    sent: number;
    opened: number;
    applied: number;
    paid: number;
    /** Active memberships on a free plan: joined, but not paid. */
    joinedFree: number;
    medianInviteToPaidHours: number | null;
    invitedVsJoined: readonly {invited: PlanCode; joined: PlanCode; count: number}[];
  };
  estimatedFirstYearHkd: number;
}>;

const count = z.coerce.number().int().nonnegative();
const funnelRow = z.object({source: z.enum(CONTACT_SOURCES), stage: z.enum(CONTACT_STAGES), n: count});
const ownerRow = z.object({
  owner_profile_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  leads: count,
  invites_sent: count,
  invites_opened: count,
  applications: count,
  members: count,
});
const inviteRow = z.object({
  sent: count, opened: count, applied: count, paid: count, joined_free: count,
  median_hours: z.coerce.number().nullable(),
});
const planRow = z.object({
  invited: z.string(),
  joined: z.string(),
  n: count,
});

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function emptyFunnel(): Record<ContactSource, Record<ContactStage, number>> {
  return Object.fromEntries(CONTACT_SOURCES.map((source) => [
    source,
    Object.fromEntries(CONTACT_STAGES.map((stage) => [stage, 0])),
  ])) as Record<ContactSource, Record<ContactStage, number>>;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

type Options = Readonly<{
  loadDatabase?: AutomationDatabaseLoader;
  loadPlans?: () => Promise<readonly PersistedMembershipPlan[]>;
  now?: () => Date;
}>;

export function createLeadReportRepository(options: Options = {}) {
  const loadDatabase = options.loadDatabase ?? defaultDatabaseLoader;
  const loadPlans = options.loadPlans ?? (() => membershipPlansRepository.list());
  const now = options.now ?? (() => new Date());

  return {
    async summary(actor: Actor, window: LeadReportWindow): Promise<LeadReport> {
      requireAdmin(actor);
      const days = window === "all" ? null : Number(parseLeadReportWindow(window));
      const cutoff = days === null ? null : new Date(now().getTime() - days * 86_400_000);
      const contactWindow: SQL = cutoff ? sql`AND c.created_at >= ${cutoff}` : sql``;
      const inviteWindow: SQL = cutoff ? sql`AND i.created_at >= ${cutoff}` : sql``;
      const database = await loadDatabase();

      const funnelRows = rowsFrom(await database.execute(sql`
        SELECT c.source, c.stage, count(*) AS n
        FROM ${contacts} c
        WHERE true ${contactWindow}
        GROUP BY c.source, c.stage
      `));

      // Leads and members come from the contact cohort; invite columns from the
      // invite cohort, attributed to the contact's CURRENT owner. The two sides are
      // stacked with UNION ALL and summed per owner, which keeps an owner who only
      // has invites (an old lead, a new invite) in the table. Not a FULL JOIN:
      // Postgres rejects FULL JOIN on `IS NOT DISTINCT FROM` (it needs a merge- or
      // hash-joinable condition), and GROUP BY already folds NULL owners into one
      // "unassigned" row.
      const ownerRows = rowsFrom(await database.execute(sql`
        WITH lead_side AS (
          SELECT c.owner_profile_id AS owner_id, count(*) AS leads,
                 count(*) FILTER (WHERE c.stage = 'member') AS members
          FROM ${contacts} c
          WHERE true ${contactWindow}
          GROUP BY c.owner_profile_id
        ), invite_side AS (
          SELECT c.owner_profile_id AS owner_id, count(DISTINCT i.contact_id) AS invites_sent,
                 count(DISTINCT i.contact_id) FILTER (WHERE i.opened_at IS NOT NULL) AS invites_opened,
                 count(DISTINCT i.application_id) AS applications
          FROM ${joinInvites} i
          JOIN ${contacts} c ON c.id = i.contact_id
          WHERE true ${inviteWindow}
          GROUP BY c.owner_profile_id
        ), combined AS (
          SELECT owner_id, leads, members,
                 0::bigint AS invites_sent, 0::bigint AS invites_opened, 0::bigint AS applications
          FROM lead_side
          UNION ALL
          SELECT owner_id, 0::bigint AS leads, 0::bigint AS members,
                 invites_sent, invites_opened, applications
          FROM invite_side
        ), per_owner AS (
          SELECT owner_id, sum(leads)::bigint AS leads, sum(invites_sent)::bigint AS invites_sent,
                 sum(invites_opened)::bigint AS invites_opened, sum(applications)::bigint AS applications,
                 sum(members)::bigint AS members
          FROM combined
          GROUP BY owner_id
        )
        SELECT o.owner_id AS owner_profile_id, p.display_name AS owner_name,
               o.leads, o.invites_sent, o.invites_opened, o.applications, o.members
        FROM per_owner o
        LEFT JOIN ${profiles} p ON p.id = o.owner_id
        ORDER BY (p.id IS NULL), o.leads DESC, p.display_name
      `));

      // One active membership per application (the earliest), so a re-issued or
      // duplicated row cannot count one conversion twice. `free` marks a plan that
      // activates without payment.
      const paidApplications = sql`
        SELECT DISTINCT ON (m.application_id) m.application_id, m.plan_code,
               (mp.billing_behavior = 'free') AS free
        FROM ${memberships} m
        JOIN ${membershipPlans} mp ON mp.code = m.plan_code
        WHERE m.status = 'active' AND m.application_id IS NOT NULL
        ORDER BY m.application_id, m.created_at
      `;
      const inviteRows = rowsFrom(await database.execute(sql`
        SELECT count(DISTINCT i.contact_id) AS sent,
               count(DISTINCT i.contact_id) FILTER (WHERE i.opened_at IS NOT NULL) AS opened,
               count(DISTINCT i.application_id) AS applied,
               count(DISTINCT pa.application_id) FILTER (WHERE NOT pa.free) AS paid,
               count(DISTINCT pa.application_id) FILTER (WHERE pa.free) AS joined_free,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM (
                   (SELECT min(a.created_at) FROM ${contactActivities} a
                    WHERE a.contact_id = i.contact_id AND a.kind = 'became_member' AND a.created_at >= i.created_at)
                   - i.created_at)) / 3600
               ) FILTER (WHERE pa.application_id IS NOT NULL AND NOT pa.free) AS median_hours
        FROM ${joinInvites} i
        LEFT JOIN (${paidApplications}) pa ON pa.application_id = i.application_id
        WHERE true ${inviteWindow}
      `));

      const planRows = rowsFrom(await database.execute(sql`
        SELECT i.plan_code AS invited, pa.plan_code AS joined, count(*) AS n
        FROM ${joinInvites} i
        JOIN (${paidApplications}) pa ON pa.application_id = i.application_id
        WHERE true ${inviteWindow}
        GROUP BY i.plan_code, pa.plan_code
        ORDER BY n DESC, i.plan_code, pa.plan_code
      `));

      const bySource = emptyFunnel();
      for (const raw of funnelRows) {
        const row = funnelRow.parse(raw);
        bySource[row.source][row.stage] += row.n;
      }

      const invite = inviteRow.parse(inviteRows[0] ?? {sent: 0, opened: 0, applied: 0, paid: 0, joined_free: 0, median_hours: null});
      const invitedVsJoined = planRows.map((raw) => {
        const row = planRow.parse(raw);
        return {invited: row.invited as PlanCode, joined: row.joined as PlanCode, count: row.n};
      });

      const prices = new Map((await loadPlans()).map((plan) => [plan.code, plan.annualPriceHkd ?? 0]));
      const estimatedFirstYearHkd = invitedVsJoined.reduce((total, row) => total + row.count * (prices.get(row.joined) ?? 0), 0);

      return {
        bySource,
        byOwner: ownerRows.map((raw) => {
          const row = ownerRow.parse(raw);
          return {
            ownerProfileId: row.owner_profile_id,
            ownerName: row.owner_name,
            leads: row.leads,
            invitesSent: row.invites_sent,
            invitesOpened: row.invites_opened,
            applications: row.applications,
            members: row.members,
          };
        }),
        invites: {
          sent: invite.sent,
          opened: invite.opened,
          applied: invite.applied,
          paid: invite.paid,
          joinedFree: invite.joined_free,
          medianInviteToPaidHours: invite.median_hours,
          invitedVsJoined,
        },
        estimatedFirstYearHkd,
      };
    },
  };
}

export const leadReportRepository = createLeadReportRepository();
export type LeadReportRepository = ReturnType<typeof createLeadReportRepository>;
