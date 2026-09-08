import {describe, expect, it, vi} from "vitest";

import {updateProfile} from "@/lib/portal/command-core";
import {WHATSAPP_CONSENT_TEXT_VERSION} from "@/lib/whatsapp/consent";

const actor = {kind: "member" as const, userId: "auth-1", profileId: "profile-1"};

function deps() {
  const update = vi.fn(async (_actor: unknown, _id: string, input: Record<string, unknown>) => ({id: "profile-1", ...input}));
  return {
    update,
    dependencies: {
      profiles: {update},
      companies: {getById: vi.fn(), update: vi.fn()},
      memberships: {list: vi.fn(async () => [{id: "m1", status: "active", companyId: null}])},
    },
  };
}

describe("portal updateProfile WhatsApp consent", () => {
  it("normalises the number and stamps portal provenance on opt-in", async () => {
    const {update, dependencies} = deps();
    await updateProfile(actor, {displayName: "Ada", whatsappNumber: "+852 9123 4567", whatsappOptIn: true}, dependencies as never);
    expect(update).toHaveBeenCalledWith(actor, "profile-1", expect.objectContaining({
      whatsappNumber: "+85291234567",
      whatsappOptIn: true,
      whatsappConsentSource: "portal",
      whatsappConsentTextVersion: WHATSAPP_CONSENT_TEXT_VERSION,
      onboardingState: "complete",
    }));
  });

  it("refuses opt-in without a number", async () => {
    const {dependencies} = deps();
    await expect(updateProfile(actor, {displayName: "Ada", whatsappOptIn: true}, dependencies as never)).rejects.toThrow();
  });

  it("clears provenance on opt-out", async () => {
    const {update, dependencies} = deps();
    await updateProfile(actor, {displayName: "Ada", whatsappNumber: "+85291234567", whatsappOptIn: false}, dependencies as never);
    expect(update).toHaveBeenCalledWith(actor, "profile-1", expect.objectContaining({whatsappOptIn: false, whatsappConsentAt: null}));
  });
});
