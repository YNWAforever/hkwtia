import {beforeEach, describe, expect, it, vi} from "vitest";
import {z} from "zod";

const authState = vi.hoisted(() => ({failure: "", notFoundCalls: 0}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    authState.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (authState.failure) throw new Error(authState.failure);
    return {kind: "staff", userId: "staff-user", profileId: "staff-profile"};
  },
}));

import {
  createAnnouncementAction,
  type AnnouncementFormActionMessages,
} from "@/lib/admin/announcement-actions";
import {runAnnouncementFormAction} from "@/lib/admin/announcement-action-core";
import {
  announcementFormInput,
  formatAnnouncementDateTime,
} from "@/lib/admin/announcement-form-input";

const messages: AnnouncementFormActionMessages = {
  successMessage: "Saved.",
  validationMessage: "Check the fields.",
  errorMessage: "Something went wrong.",
};

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    titleEn: "Applications are open",
    titleZhHk: "現正接受申請",
    ctaLabelEn: "View programme",
    ctaLabelZhHk: "查看計劃",
    href: "/launchpad",
    startsAt: "2026-08-28T08:00",
    endsAt: "2026-08-29T08:00",
    priority: "50",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("announcement action core", () => {
  beforeEach(() => {
    authState.failure = "";
    authState.notFoundCalls = 0;
  });

  it("parses Hong Kong datetime-local values and exact numeric priority", () => {
    expect(announcementFormInput(form())).toEqual({
      titleEn: "Applications are open",
      titleZhHk: "現正接受申請",
      ctaLabelEn: "View programme",
      ctaLabelZhHk: "查看計劃",
      href: "/launchpad",
      startsAt: new Date("2026-08-28T00:00:00.000Z"),
      endsAt: new Date("2026-08-29T00:00:00.000Z"),
      priority: 50,
    });
    expect(formatAnnouncementDateTime(new Date("2026-08-28T00:00:00.000Z")))
      .toBe("2026-08-28T08:00");
  });

  it("surfaces malformed datetime and priority on their fields", () => {
    expect(() => announcementFormInput(form({startsAt: "2026-02-31T10:00"})))
      .toThrow(z.ZodError);
    expect(() => announcementFormInput(form({priority: "1.5"}))).toThrow(z.ZodError);
  });

  it("returns success without exposing the mutation result", async () => {
    await expect(runAnnouncementFormAction({}, form(), {
      ...messages,
      mutate: async () => ({private: "row"}),
    })).resolves.toEqual({status: "success", message: "Saved."});
  });

  it("maps validation to localized field errors and echoes only allowlisted strings", async () => {
    const state = await runAnnouncementFormAction({}, form({titleEn: "Bad"}), {
      ...messages,
      mutate: async () => {
        throw new z.ZodError([{
          code: z.ZodIssueCode.custom,
          path: ["titleEn"],
          message: "invalid",
        }]);
      },
    });
    expect(state).toEqual({
      status: "error",
      message: "Check the fields.",
      fieldErrors: {titleEn: "Check the fields."},
      values: expect.objectContaining({titleEn: "Bad", href: "/launchpad", priority: "50"}),
    });
    expect(Object.keys(state.values ?? {}).sort()).toEqual([
      "ctaLabelEn", "ctaLabelZhHk", "endsAt", "href", "priority",
      "startsAt", "titleEn", "titleZhHk",
    ]);
  });

  it("returns a generic error without leaking domain details", async () => {
    const state = await runAnnouncementFormAction({}, form(), {
      ...messages,
      mutate: async () => { throw new Error("private-db.internal refused"); },
    });
    expect(state).toMatchObject({status: "error", message: "Something went wrong."});
    expect(JSON.stringify(state)).not.toContain("private-db.internal");
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])(
    "authorizes before reading FormData and maps %s to notFound",
    async (failure) => {
      authState.failure = failure;
      const data = form();
      const get = vi.spyOn(data, "get");
      await expect(createAnnouncementAction(
        "/en/admin/announcements", messages, {}, data,
      )).rejects.toThrow("NEXT_NOT_FOUND");
      expect(authState.notFoundCalls).toBe(1);
      expect(get).not.toHaveBeenCalled();
    },
  );
});
