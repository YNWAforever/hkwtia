import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {NewsForm} from "@/components/admin/news-form";
import {runNewsFormAction} from "@/lib/admin/news-action-core";
import {newsFormInput} from "@/lib/admin/news-form-input";
import {
  createNewsPost,
  updateNewsPost,
  type NewsMutationDependencies,
} from "@/lib/db/repos/admin-posts";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const bodies = {
  bodyMdx: "## English body\n\nSafe **content**.",
  bodyMdxZhHk: "## 中文內文\n\n安全的**內容**。",
} as const;
const validInput = {
  slug: "bilingual-news",
  titleEn: "Bilingual news",
  titleZh: "雙語消息",
  ...bodies,
  author: "WTIA",
  publishedAt: null,
};

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "news",
    ...validInput,
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date("2026-08-29T00:00:00.000Z"),
    sourceKey: null,
    agentRunId: null,
    archivedAt: null,
    ...overrides,
  };
}

function mutationDependencies() {
  const transaction = {
    findBySlug: vi.fn(async () => null),
    insertPost: vi.fn(async (input: Record<string, unknown>) => post(input)),
    lockPost: vi.fn(async () => post()),
    updatePost: vi.fn(async (_id: string, input: Record<string, unknown>) => post(input)),
    setArchivedAt: vi.fn(async () => post()),
    insertAudit: vi.fn(async () => undefined),
  };
  const dependencies: NewsMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {dependencies, transaction};
}

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    slug: validInput.slug,
    titleEn: validInput.titleEn,
    titleZh: validInput.titleZh,
    bodyMdx: bodies.bodyMdx,
    bodyMdxZhHk: bodies.bodyMdxZhHk,
    author: validInput.author,
    ...values,
  })) data.set(key, value);
  return data;
}

describe("localized news-body repository contract", () => {
  it("persists both bodies and creation audit inside the same transaction", async () => {
    const {dependencies, transaction} = mutationDependencies();

    await createNewsPost(staff, validInput, dependencies);

    expect(transaction.insertPost).toHaveBeenCalledWith(expect.objectContaining(bodies));
    expect(transaction.insertAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "post.created",
      metadata: expect.objectContaining({published: false}),
    }));
    expect(transaction.insertPost.mock.invocationCallOrder[0])
      .toBeLessThan(transaction.insertAudit.mock.invocationCallOrder[0]);
  });

  it.each([
    ["English", {bodyMdx: ""}, "bodyMdx"],
    ["Traditional Chinese", {bodyMdxZhHk: ""}, "bodyMdxZhHk"],
  ])("requires the %s body when creating", async (_locale, override, field) => {
    const {dependencies, transaction} = mutationDependencies();

    await expect(createNewsPost(staff, {...validInput, ...override}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: [field]})]});
    expect(transaction.insertPost).not.toHaveBeenCalled();
  });

  it("requires and audits both bodies on every edited news record", async () => {
    const {dependencies, transaction} = mutationDependencies();

    await expect(updateNewsPost(staff, post().id, {titleEn: "Incomplete"}, dependencies))
      .rejects.toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({path: ["bodyMdx"]}),
          expect.objectContaining({path: ["bodyMdxZhHk"]}),
        ]),
      });

    await updateNewsPost(staff, post().id, {...validInput, ...bodies}, dependencies);
    expect(transaction.updatePost).toHaveBeenCalledWith(
      post().id,
      expect.objectContaining(bodies),
    );
    expect(transaction.insertAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "post.updated",
      metadata: expect.objectContaining({
        fields: expect.arrayContaining(["bodyMdx", "bodyMdxZhHk"]),
      }),
    }));
  });
});

describe("localized news form contract", () => {
  it("parses, preserves, validates, and renders separate English and Chinese bodies", async () => {
    expect(newsFormInput(form())).toMatchObject(bodies);

    const state = await runNewsFormAction({}, form(), {
      successMessage: "Saved.",
      validationMessage: "Check the fields.",
      slugConflictMessage: "Slug conflict.",
      errorMessage: "Error.",
      mutate: async () => {
        const {z} = await import("zod");
        throw new z.ZodError([{
          code: z.ZodIssueCode.custom,
          path: ["bodyMdxZhHk"],
          message: "required",
        }]);
      },
    });
    expect(state.values).toMatchObject(bodies);
    expect(state.fieldErrors).toEqual({bodyMdxZhHk: "Check the fields."});

    render(<NewsForm
      action={vi.fn()}
      labels={{
        slug: "Slug", titleEn: "English title", titleZh: "Chinese title",
        author: "Author", bodyMdx: "English body", bodyMdxZhHk: "Chinese body",
        bodyHelp: "Safe formatting only", published: "Published",
        save: "Save", saving: "Saving",
      }}
      values={{...validInput}}
    />);
    expect(screen.getByLabelText(/English body/)).toHaveValue(bodies.bodyMdx);
    expect(screen.getByLabelText(/Chinese body/)).toHaveValue(bodies.bodyMdxZhHk);
    expect(screen.getByLabelText(/English body/)).toHaveAttribute("required");
    expect(screen.getByLabelText(/Chinese body/)).toHaveAttribute("required");
  });
});

describe("news page authorization ordering", () => {
  it("guards the detail page before parsing its route id or loading the post", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/[locale]/(admin)/admin/news/[id]/page.tsx"),
      "utf8",
    );
    const authorize = source.indexOf("await requireAdminPageActor()");
    const parse = source.indexOf("idSchema.safeParse(rawId)");
    const load = source.indexOf("adminPostsRepository.getForAdmin");

    expect(authorize).toBeGreaterThan(-1);
    expect(authorize).toBeLessThan(parse);
    expect(authorize).toBeLessThan(load);
  });
});

describe("PR5 public-cutover boundary", () => {
  it("keeps the public repository, routes, renderer, buildlog, and page owners on body_mdx", () => {
    const protectedPaths = [
      "lib/db/repos/public-posts.ts",
      "lib/db/repos/posts.ts",
      "lib/db/repos/board-drafts.ts",
      "app/[locale]/(public)/news/page.tsx",
      "app/[locale]/(public)/news/[slug]/page.tsx",
      "components/marketing/build-log-detail.tsx",
    ];
    for (const path of protectedPaths) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source, path).not.toMatch(/bodyMdxZhHk|body_mdx_zh_hk/);
    }

    const publicRepository = readFileSync(
      resolve(process.cwd(), "lib/db/repos/public-posts.ts"),
      "utf8",
    );
    expect(publicRepository).toContain("bodyMdx: posts.bodyMdx");
    const renderer = readFileSync(
      resolve(process.cwd(), "components/marketing/build-log-detail.tsx"),
      "utf8",
    );
    expect(renderer).toContain("SafeStructuredContent");
    expect(renderer).toContain("content={post.bodyMdx}");
  });
});
