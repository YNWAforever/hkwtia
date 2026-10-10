import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {CONTACT_ACTIVITY_KINDS} from "@/lib/db/repos/contact-activities";
import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";
import {createJoinInvitesRepository} from "@/lib/db/repos/join-invites";

/**
 * Final review C1: one invited lead across the three writes that can move their stage —
 * the profile save (`contactsRepository.linkProfile`), the submit (`joinInvitesRepository.consume`)
 * and the activation (`contactsRepository.markMemberForProfile`) — in the orders they really
 * happen. The fake keeps one contact row and honours each statement's guards ONLY when the SQL
 * carries them, so a guard that disappears from the SQL fails here as a wrong stage.
 */
const dialect = new PgDialect();
type Row = Record<string, unknown>;

const contactId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const applicationId = "33333333-3333-4333-8333-333333333333";
const profileId = "member-1";
const FUNNEL = ["new", "contacted", "qualified", "applied"];
const ACTIVE_GATE = "exists (select 1 from \"memberships\" m";

function lifecycleDatabase(initialStage: string) {
  const state = {
    stage: initialStage,
    profileId: null as string | null,
    membership: "none" as "none" | "pending_payment" | "active",
    consumed: false,
    activities: [] as string[],
    audits: [] as string[],
  };
  const respond = (text: string, params: readonly unknown[]): Row[] => {
    if (text.startsWith("select") && text.includes("for update") && text.includes("\"phone_e164\"")) return [{id: contactId}];
    if (text.startsWith("update \"contacts\" set profile_id =") && text.includes("prior.stage as previous_stage")) {
      if (state.profileId !== null) return [];
      const previous = state.stage;
      // The C1 gate: only an active membership moves the stage at link time.
      const gated = text.includes(ACTIVE_GATE) && text.includes("m.status = 'active'");
      if (FUNNEL.includes(previous) && (!gated || state.membership === "active")) state.stage = "member";
      state.profileId = String(params[0]);
      return [{id: contactId, previous_stage: previous, stage: state.stage}];
    }
    if (text.startsWith("select id from \"membership_applications\"")) return [{id: applicationId}];
    if (text.startsWith("update \"join_invites\" set consumed_at")) {
      if (state.consumed) return [];
      state.consumed = true;
      return [{contact_id: contactId}];
    }
    if (text.startsWith("update \"contacts\" set stage = 'applied'")) {
      if (text.includes("stage in ('new', 'contacted', 'qualified')") && ["new", "contacted", "qualified"].includes(state.stage)) state.stage = "applied";
      return [];
    }
    if (text.startsWith("update \"contacts\" set profile_id =")) {
      if (state.profileId === null) state.profileId = profileId;
      return [];
    }
    if (text.startsWith("select 1 as active from \"memberships\"")) return state.membership === "active" ? [{active: 1}] : [];
    if (text.startsWith("update \"contacts\" set stage = 'member'")) {
      const byProfile = text.includes("from (select id, stage from \"contacts\" where profile_id =");
      if (byProfile && state.profileId !== params.find((value) => value === profileId)) return [];
      if (!text.includes("in ('new', 'contacted', 'qualified', 'applied')") || !FUNNEL.includes(state.stage)) return [];
      const previous = state.stage;
      state.stage = "member";
      return [{id: contactId, previous_stage: previous}];
    }
    if (text.startsWith("insert into \"contact_activities\"")) {
      const kind = params.find((value) => (CONTACT_ACTIVITY_KINDS as readonly unknown[]).includes(value));
      state.activities.push(String(kind));
      return [];
    }
    if (text.startsWith("insert into \"audit_events\"")) {
      state.audits.push(/'([a-z_]+\.[a-z_.]+)'/.exec(text)?.[1] ?? "?");
      return [];
    }
    return [];
  };
  type Executor = {execute: (query: unknown) => Promise<unknown>; transaction: <T>(work: (tx: Executor) => Promise<T>) => Promise<T>};
  const executor: Executor = {
    async execute(query: unknown) {
      const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
      const text = rendered.sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      return {rows: respond(text, rendered.params)};
    },
    transaction: (work) => work(executor),
  };
  return {state, database: executor as never};
}

const writer = contactWriterActor("import");
const member = {kind: "member", userId: profileId, profileId} as const;
const webhook = {kind: "system", userId: null, source: "stripe-webhook"} as never;
const link = {profileId, email: null, phoneE164: "+85291234567"};

function repositories(database: never) {
  return {
    contacts: createContactsRepository(async () => database),
    invites: createJoinInvitesRepository(async () => database),
  };
}

describe("invited lead lifecycle across profile save, submit and activation", () => {
  it("paid plan: profile save leaves the stage, submit moves to applied, activation to member", async () => {
    const {state, database} = lifecycleDatabase("qualified");
    const {contacts, invites} = repositories(database);

    await contacts.linkProfile(writer, link);
    expect(state).toMatchObject({stage: "qualified", profileId, activities: []});

    state.membership = "pending_payment";
    await expect(invites.consume(member, {inviteId, applicationId})).resolves.toBe("consumed");
    expect(state).toMatchObject({stage: "applied", activities: ["applied"]});

    state.membership = "active";
    await expect(contacts.markMemberForProfile(webhook, profileId)).resolves.toBe("flipped");
    expect(state).toMatchObject({stage: "member", activities: ["applied", "became_member"]});
    expect(state.audits.filter((action) => action === "contact.became_member")).toHaveLength(1);
  });

  it("free plan: activation runs before attribution, so consume records applied without a second move", async () => {
    const {state, database} = lifecycleDatabase("contacted");
    const {contacts, invites} = repositories(database);

    await contacts.linkProfile(writer, link);
    expect(state).toMatchObject({stage: "contacted", activities: []});

    state.membership = "active";
    await expect(contacts.markMemberForProfile(member as never, profileId)).resolves.toBe("flipped");
    expect(state).toMatchObject({stage: "member", activities: ["became_member"]});

    await expect(invites.consume(member, {inviteId, applicationId})).resolves.toBe("consumed");
    expect(state).toMatchObject({stage: "member", activities: ["became_member", "applied"]});
  });

  it("activation before any link: the later profile save finds the active membership and moves to member", async () => {
    const {state, database} = lifecycleDatabase("new");
    const {contacts} = repositories(database);

    state.membership = "active";
    await expect(contacts.markMemberForProfile(webhook, profileId)).resolves.toBe("unchanged");
    expect(state).toMatchObject({stage: "new", profileId: null, activities: []});

    await contacts.linkProfile(writer, link);
    expect(state).toMatchObject({stage: "member", profileId, activities: ["became_member"]});
  });
});
