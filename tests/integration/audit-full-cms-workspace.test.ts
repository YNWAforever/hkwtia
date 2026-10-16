// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => state.database,
}));
import {
  readCopyWorkspace,
  saveCopyDraft,
  publishCopyDraft,
  restoreCopyPublication,
  readPrivateCopyDraft,
  listPageCopyForLocale,
} from "@/lib/db/repos/page-copy";
const a = {
  kind: "staff",
  profileId: "t17-editor-a",
  userId: "t17-auth-a",
} as const;
const b = {
  kind: "staff",
  profileId: "t17-editor-b",
  userId: "t17-auth-b",
} as const;
const member = {
  kind: "member",
  profileId: "t17-member",
  userId: "t17-auth-member",
} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "private CMS lifecycle actual PostgreSQL",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      state.database = f.database;
      vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES ('t17-editor-a','t17-auth-a','Synthetic A','staff'),('t17-editor-b','t17-auth-b','Synthetic B','staff')",
      );
    }, 120000);
    beforeEach(async () => {
      await f.pool.query("TRUNCATE page_copy_drafts,page_copy");
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      if (f) await f.close();
    });
    async function draft(
      actor: typeof a | typeof b = a,
      value = "Synthetic private",
    ) {
      const w = await readCopyWorkspace(actor, "Home");
      return saveCopyDraft(actor, {
        namespace: "Home",
        baseRevision: w.revision,
        expectedDraftRevision: null,
        changes: { "en:hero.title": value, "zh-HK:hero.title": "合成私人草稿" },
      });
    }
    const publish = (
      actor: typeof a | typeof b,
      x: Awaited<ReturnType<typeof draft>>,
    ) =>
      publishCopyDraft(actor, {
        draftId: x.draftId,
        expectedDraftRevision: x.revision,
        expectedPublishedRevision: x.publishedRevision,
      });
    it("saves privately across reads without changing either public locale; denies foreign/member reads", async () => {
      const x = await draft();
      expect(await listPageCopyForLocale("en")).toEqual([]);
      expect(await listPageCopyForLocale("zh-HK")).toEqual([]);
      expect((await readCopyWorkspace(a, "Home")).draft?.revision).toBe(
        x.revision,
      );
      expect((await readCopyWorkspace(b, "Home")).draft).toBeNull();
      await expect(readPrivateCopyDraft(b, x.draftId)).rejects.toThrow(
        "PAGE_COPY_DRAFT_NOT_FOUND",
      );
      await expect(readPrivateCopyDraft(member, x.draftId)).rejects.toThrow(
        "FORBIDDEN",
      );
      expect((await readPrivateCopyDraft(a, x.draftId)).entries).toContainEqual(
        { locale: "en", keyPath: "hero.title", value: "Synthetic private" },
      );
    });
    it("publishes both locales once and rejects a concurrent second editor without losing their private draft", async () => {
      const x = await draft();
      const y = await draft(b, "Synthetic other editor");
      await publish(a, x);
      await expect(publish(b, y)).rejects.toThrow("PAGE_COPY_EDIT_CONFLICT");
      expect((await listPageCopyForLocale("en"))[0]?.value).toBe(
        "Synthetic private",
      );
      expect((await listPageCopyForLocale("zh-HK"))[0]?.value).toBe(
        "合成私人草稿",
      );
      expect((await readPrivateCopyDraft(b, y.draftId)).revision).toBe(
        y.revision,
      );
      const n = (
        await f.pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='page_copy.published'",
          [x.draftId],
        )
      ).rows[0].n;
      expect(n).toBe(1);
    });
    it("fences two tabs saving the same owner's draft and treats an unchanged save as a no-op", async () => {
      const x = await draft();
      const input = {
        namespace: "Home",
        baseRevision: x.publishedRevision,
        expectedDraftRevision: x.revision,
        changes: { "en:hero.title": "Synthetic private" },
      };
      expect((await saveCopyDraft(a, input)).revision).toBe(x.revision);
      const y = await saveCopyDraft(a, {
        ...input,
        changes: { "en:hero.title": "New synthetic edit" },
      });
      expect(y.revision).not.toBe(x.revision);
      await expect(saveCopyDraft(a, input)).rejects.toThrow(
        "PAGE_COPY_EDIT_CONFLICT",
      );
      expect((await readPrivateCopyDraft(a, x.draftId)).entries).toContainEqual(
        { locale: "en", keyPath: "hero.title", value: "New synthetic edit" },
      );
    });
    it("explicitly rebases only this editor's changed fields and adopts concurrent unchanged fields", async () => {
      const x = await draft();
      const w = await readCopyWorkspace(b, "Home");
      const y = await saveCopyDraft(b, {
        namespace: "Home",
        baseRevision: w.revision,
        expectedDraftRevision: null,
        changes: { "en:hero.lead": "Concurrent synthetic lead" },
      });
      const published = await publish(b, y);
      await expect(
        saveCopyDraft(a, {
          namespace: "Home",
          baseRevision: published.revision,
          expectedDraftRevision: x.revision,
          changes: {},
        }),
      ).rejects.toThrow("PAGE_COPY_EDIT_CONFLICT");
      const rebased = await saveCopyDraft(a, {
        namespace: "Home",
        baseRevision: published.revision,
        expectedDraftRevision: x.revision,
        changes: {},
        rebase: true,
      });
      const row = await readPrivateCopyDraft(a, x.draftId);
      expect(row.entries).toContainEqual({
        locale: "en",
        keyPath: "hero.lead",
        value: "Concurrent synthetic lead",
      });
      expect(row.entries).toContainEqual({
        locale: "en",
        keyPath: "hero.title",
        value: "Synthetic private",
      });
      expect(await listPageCopyForLocale("en")).not.toContainEqual({
        namespace: "Home",
        keyPath: "hero.title",
        value: "Synthetic private",
      });
      await publish(a, rebased);
      expect(await listPageCopyForLocale("en")).toContainEqual({
        namespace: "Home",
        keyPath: "hero.lead",
        value: "Concurrent synthetic lead",
      });
    });
    it("rejects unknown cleared paths, hostile locales and lost ICU placeholders before persistence", async () => {
      const w = await readCopyWorkspace(a, "Home");
      for (const changes of [
        { "en:no.such.key": "" },
        { "fr:hero.title": "x" },
        { "en:legacyNetwork.previewNote": "removed placeholder" },
      ]) {
        await expect(
          saveCopyDraft(a, {
            namespace: "Home",
            baseRevision: w.revision,
            expectedDraftRevision: null,
            changes,
          }),
        ).rejects.toThrow();
      }
      expect(
        (await f.pool.query("SELECT count(*)::int AS n FROM page_copy_drafts"))
          .rows[0].n,
      ).toBe(0);
    });
    it("rolls back publication, both public locales and history when its transactional audit fails", async () => {
      const x = await draft();
      await f.pool.query(
        "CREATE FUNCTION t17_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='page_copy.published' THEN RAISE EXCEPTION 'controlled audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER t17_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION t17_reject_audit()",
      );
      try {
        await expect(publish(a, x)).rejects.toThrow();
        expect(await listPageCopyForLocale("en")).toEqual([]);
        expect(
          (await readPrivateCopyDraft(a, x.draftId)).publishedAt,
        ).toBeNull();
      } finally {
        await f.pool.query(
          "DROP TRIGGER t17_reject_audit ON audit_events; DROP FUNCTION t17_reject_audit()",
        );
      }
    });
    it("restores the first publication's previous copy as a private draft, then creates a new public revision without an ABA conflict bypass", async () => {
      const initial = (await readCopyWorkspace(a, "Home")).revision;
      const x = await draft();
      const p = await publish(a, x);
      const restored = await restoreCopyPublication(a, {
        publicationId: x.draftId,
        expectedPublishedRevision: p.revision,
        expectedDraftRevision: null,
        previous: true,
      });
      expect((await listPageCopyForLocale("en"))[0]?.value).toBe(
        "Synthetic private",
      );
      const reverted = await publish(a, restored);
      expect(await listPageCopyForLocale("en")).toEqual([]);
      expect(reverted.revision).not.toBe(initial);
      expect((await readCopyWorkspace(a, "Home")).history).toHaveLength(2);
      await expect(
        saveCopyDraft(b, {
          namespace: "Home",
          baseRevision: initial,
          expectedDraftRevision: null,
          changes: { "en:hero.title": "stale" },
        }),
      ).rejects.toThrow("PAGE_COPY_EDIT_CONFLICT");
    });
    it("serializes duplicate publication attempts to one commit and retains the immutable published snapshot", async () => {
      const x = await draft();
      const results = await Promise.allSettled([publish(a, x), publish(a, x)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='page_copy.published'",
            [x.draftId],
          )
        ).rows[0].n,
      ).toBe(1);
      await expect(readPrivateCopyDraft(a, x.draftId)).rejects.toThrow(
        "PAGE_COPY_DRAFT_NOT_FOUND",
      );
    });
    it("fails closed when draft flag is off without changing public copy or private history", async () => {
      const x = await draft();
      vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "false");
      try {
        await expect(publish(a, x)).rejects.toThrow("CMS_DRAFTS_DISABLED");
        expect(await listPageCopyForLocale("en")).toEqual([]);
      } finally {
        vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
      }
    });
  },
);
