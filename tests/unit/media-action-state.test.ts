import {describe, expect, it} from "vitest";
import {z} from "zod";

import {runMediaFormAction} from "@/lib/admin/media-action-core";
import {mediaFormInput} from "@/lib/admin/media-form-input";

const messages = {
  successMessage: "Saved.",
  urlInvalidMessage: "Use a path to a file on this site.",
  urlConflictMessage: "That image is already registered.",
  validationMessage: "Check the fields.",
  errorMessage: "Something went wrong.",
};

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("url", "/images/showcase/example.png");
  data.set("altEn", "Example logo");
  data.set("altZh", "示例標誌");
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function zodError(path: string, message: string): z.ZodError {
  return new z.ZodError([{code: z.ZodIssueCode.custom, path: [path], message}]);
}

describe("media form action core", () => {
  it("returns only a message on success", async () => {
    await expect(runMediaFormAction({}, form(), {...messages, mutate: async () => undefined}))
      .resolves.toEqual({status: "success", message: "Saved."});
  });

  it.each([
    ["MEDIA_URL_INVALID", "Use a path to a file on this site."],
    ["MEDIA_URL_TAKEN", "That image is already registered."],
  ])("gives %s its own message rather than a generic one", async (code, expected) => {
    const state = await runMediaFormAction({}, form(), {
      ...messages,
      mutate: async () => {
        throw zodError("url", code);
      },
    });

    expect(state.message).toBe(expected);
    expect(state.fieldErrors).toEqual({url: expected});
  });

  it("echoes the allowlisted values so a rejected url is not retyped", async () => {
    const state = await runMediaFormAction({}, form({url: "https://cdn.example.com/logo.png"}), {
      ...messages,
      mutate: async () => {
        throw zodError("url", "MEDIA_URL_INVALID");
      },
    });

    expect(state.values).toEqual({
      url: "https://cdn.example.com/logo.png",
      altEn: "Example logo",
      altZh: "示例標誌",
    });
  });

  it("falls back to the generic validation message for other fields", async () => {
    const state = await runMediaFormAction({}, form({altEn: ""}), {
      ...messages,
      mutate: async () => {
        throw zodError("altEn", "Too small");
      },
    });

    expect(state.message).toBe("Check the fields.");
    expect(state.fieldErrors).toEqual({altEn: "Check the fields."});
  });

  it("never leaks a domain error to the browser", async () => {
    const state = await runMediaFormAction({}, form(), {
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
    await expect(runMediaFormAction({}, form(), {
      ...messages,
      mutate: async () => {
        throw new Error(message);
      },
    })).rejects.toThrow(message);
  });
});

describe("media form input", () => {
  it("reads and trims only the three declared fields", () => {
    const data = form({url: "  /images/logo.png  ", altEn: " Spaced "});
    data.set("registeredByProfileId", "profile-attacker");
    data.set("id", "11111111-1111-4111-8111-111111111111");

    expect(mediaFormInput(data)).toEqual({
      url: "/images/logo.png",
      altEn: "Spaced",
      altZh: "示例標誌",
    });
  });

  it("maps absent fields to empty strings rather than undefined", () => {
    expect(mediaFormInput(new FormData())).toEqual({url: "", altEn: "", altZh: ""});
  });
});
