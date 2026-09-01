import {beforeEach, describe, expect, it, vi} from "vitest";

const requireAdminActor = vi.hoisted(() => vi.fn());
const getNewsForAdmin = vi.hoisted(() => vi.fn());
const createNewsPost = vi.hoisted(() => vi.fn());
const updateNewsPost = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor}));
vi.mock("@/lib/db/repos/admin-posts", () => ({
  createNewsPost,
  getNewsForAdmin,
  setNewsArchived: vi.fn(),
  updateNewsPost,
}));
vi.mock("@/lib/admin/revalidate-path", () => ({revalidateAdminPath: vi.fn()}));
vi.mock("@/lib/news/revalidate", () => ({revalidatePublicNews: vi.fn()}));

import {createNewsAction, updateNewsAction} from "@/lib/admin/news-actions";

const messages = {
  successMessage: "Saved.",
  validationMessage: "Invalid.",
  slugConflictMessage: "Conflict.",
  errorMessage: "Error.",
};

function unreadableForm(): FormData {
  return {
    get: vi.fn(() => {
      throw new Error("FORM_READ_BEFORE_AUTH");
    }),
  } as unknown as FormData;
}

describe("news server-action authorization ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminActor.mockRejectedValue(new Error("FORBIDDEN"));
  });

  it("denies create before reading any form field or loading data", async () => {
    const data = unreadableForm();

    await expect(createNewsAction("/en/admin/news", messages, {}, data))
      .rejects.toThrow("NOT_FOUND");

    expect(data.get).not.toHaveBeenCalled();
    expect(createNewsPost).not.toHaveBeenCalled();
    expect(getNewsForAdmin).not.toHaveBeenCalled();
  });

  it("denies update before reading fields or loading the current post", async () => {
    const data = unreadableForm();

    await expect(updateNewsAction(
      "11111111-1111-4111-8111-111111111111",
      "/en/admin/news/11111111-1111-4111-8111-111111111111",
      messages,
      {},
      data,
    )).rejects.toThrow("NOT_FOUND");

    expect(data.get).not.toHaveBeenCalled();
    expect(getNewsForAdmin).not.toHaveBeenCalled();
    expect(updateNewsPost).not.toHaveBeenCalled();
  });
});
