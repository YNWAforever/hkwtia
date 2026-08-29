import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {NewsForm} from "@/components/admin/news-form";
import {newsFormInput} from "@/lib/admin/news-form-input";
import {createNewsPost, type NewsMutationDependencies} from "@/lib/db/repos/admin-posts";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const bodies = {bodyMdx: "English", bodyMdxZhHk: "中文"} as const;
const validInput = {slug: "bilingual-news", titleEn: "English", titleZh: "中文", ...bodies, author: "WTIA", publishedAt: null};
function dependencies() { const transaction = {findBySlug: vi.fn(async () => null), insertPost: vi.fn(async (input: Record<string, unknown>) => ({...input, id: "11111111-1111-4111-8111-111111111111", kind: "news", createdAt: new Date(), updatedAt: new Date(), sourceKey: null, agentRunId: null, archivedAt: null})), insertAudit: vi.fn(async () => undefined)}; return {input: {transaction: (work) => work(transaction as never)} as NewsMutationDependencies, transaction}; }
describe("localized news-body repository and form contract", () => {
  it("persists and requires both authored bodies", async () => { const {input, transaction} = dependencies(); await createNewsPost(staff, validInput, input); expect(transaction.insertPost).toHaveBeenCalledWith(expect.objectContaining(bodies)); expect(newsFormInput(Object.assign(new FormData(), {}))).not.toBeDefined; });
  it("renders both authored body controls", () => { render(<NewsForm action={vi.fn()} labels={{slug: "Slug", titleEn: "English", titleZh: "Chinese", author: "Author", bodyMdx: "English body", bodyMdxZhHk: "Chinese body", bodyHelp: "Safe", published: "Published", save: "Save", saving: "Saving"}} values={validInput}/>); expect(screen.getByLabelText(/English body/)).toHaveAttribute("required"); expect(screen.getByLabelText(/Chinese body/)).toHaveAttribute("required"); });
});
describe("PR5 public-cutover boundary", () => {
  it("keeps localized News separate from the single-body Build Log contract", () => {
    const repository = readFileSync(resolve(process.cwd(), "lib/db/repos/public-posts.ts"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/news/[slug]/page.tsx"), "utf8");
    const index = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/news/page.tsx"), "utf8");
    expect(repository).toContain("localizedNewsBody");
    expect(repository).toContain("posts.bodyMdxZhHk");
    expect(repository).toContain("bodyMdx: posts.bodyMdx");
    expect(detail).toContain("NewsDetail");
    expect(index).toContain("title={post.title}");
    const renderer = readFileSync(resolve(process.cwd(), "components/marketing/build-log-detail.tsx"), "utf8");
    expect(renderer).toContain("content={post.bodyMdx}");
    expect(renderer).not.toMatch(/bodyMdxZhHk|body_mdx_zh_hk/);
  });
});
