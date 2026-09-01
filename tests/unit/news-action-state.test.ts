import {describe, expect, it} from "vitest";
import {z} from "zod";

import {runNewsFormAction} from "@/lib/admin/news-action-core";
import {newsFormInput, newsPublishedAt} from "@/lib/admin/news-form-input";

const messages = {
  successMessage: "Saved.",
  validationMessage: "Check the fields.",
  slugConflictMessage: "That URL slug is already taken.",
  errorMessage: "Something went wrong.",
};

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("slug", "wtia-welcomes-new-members");
  data.set("titleEn", "WTIA welcomes new members");
  data.set("titleZh", "WTIA 歡迎新會員");
  data.set("bodyMdx", "## Welcome");
  data.set("bodyMdxZhHk", "## 歡迎");
  data.set("author", "WTIA");
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("news form action core", () => {
  it("returns only a message on success", async () => {
    await expect(runNewsFormAction({}, form(), {...messages, mutate: async () => undefined}))
      .resolves.toEqual({status: "success", message: "Saved."});
  });

  it("maps a zod failure to field errors and echoes the allowlisted values", async () => {
    const state = await runNewsFormAction({}, form({slug: "Bad Slug"}), {
      ...messages,
      mutate: async () => {
        throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["slug"], message: "bad"}]);
      },
    });

    expect(state).toEqual({
      status: "error",
      message: "Check the fields.",
      fieldErrors: {slug: "Check the fields."},
      values: {
        slug: "Bad Slug",
        titleEn: "WTIA welcomes new members",
        titleZh: "WTIA 歡迎新會員",
        bodyMdx: "## Welcome",
        bodyMdxZhHk: "## 歡迎",
        author: "WTIA",
        published: "",
      },
    });
  });

  it("gives a duplicate slug its own message", async () => {
    const state = await runNewsFormAction({}, form(), {
      ...messages,
      mutate: async () => {
        throw new z.ZodError([{
          code: z.ZodIssueCode.custom, path: ["slug"], message: "NEWS_SLUG_TAKEN",
        }]);
      },
    });

    expect(state.message).toBe("That URL slug is already taken.");
    expect(state.fieldErrors).toEqual({slug: "That URL slug is already taken."});
  });

  it("never leaks a domain error to the browser", async () => {
    const state = await runNewsFormAction({}, form(), {
      ...messages,
      mutate: async () => {
        throw new Error("connection to private-host.internal refused");
      },
    });

    expect(state.status).toBe("error");
    expect(state.message).toBe("Something went wrong.");
    expect(JSON.stringify(state)).not.toContain("private-host.internal");
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("re-throws %s for the action boundary", async (message) => {
    await expect(runNewsFormAction({}, form(), {
      ...messages,
      mutate: async () => {
        throw new Error(message);
      },
    })).rejects.toThrow(message);
  });
});

describe("news form input", () => {
  it("maps the checkbox to a publication instant", () => {
    const now = () => new Date("2026-08-02T03:00:00.000Z");

    expect(newsPublishedAt(form(), null, now)).toBeNull();
    expect(newsPublishedAt(form({published: "on"}), null, now))
      .toEqual(new Date("2026-08-02T03:00:00.000Z"));
  });

  it("keeps the original instant so re-saving does not reorder the feed", () => {
    const original = new Date("2026-07-01T00:00:00.000Z");

    expect(newsPublishedAt(form({published: "on"}), original, () => new Date()))
      .toEqual(original);
  });

  it("clears the instant when the post is unpublished", () => {
    expect(newsPublishedAt(form(), new Date("2026-07-01T00:00:00.000Z"))).toBeNull();
  });

  it("trims every text field", () => {
    expect(newsFormInput(form({titleEn: "  Spaced  "}))).toMatchObject({titleEn: "Spaced"});
  });
});
