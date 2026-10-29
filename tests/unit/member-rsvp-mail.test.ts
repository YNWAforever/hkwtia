import {describe, expect, it, vi} from "vitest";

import {deliverMemberRsvpNotice, memberRsvpIdempotencyKey} from "@/lib/events/member-rsvp-mail";
import {createTestTransport} from "@/lib/email/transport";

const eventId = "11111111-1111-4111-8111-111111111111";
const profileId = "profile-a";

describe("member RSVP mail", () => {
  it.each([
    ["registered", "event_member_confirmation"],
    ["waitlist", "event_member_waitlist"],
    ["withdrawn", "event_member_rsvp_withdrawn"],
  ] as const)("sends the %s notice once for the same member and event", async (kind, template) => {
    const transport = createTestTransport();
    const renderEmail = vi.fn(async () => ({subject: template, html: "<p>ok</p>", text: "ok", headers: {}}));
    const notice = {
      to: "ada@example.test", recipientName: "Ada", locale: "zh-HK" as const, kind,
      eventId, profileId, eventTitle: "人工智能診所", slug: "ai-clinic",
    };
    await deliverMemberRsvpNotice(notice, {transport, renderEmail, emailFrom: "events@wtia.test", appUrl: "https://wtia.test"});
    await deliverMemberRsvpNotice(notice, {transport, renderEmail, emailFrom: "events@wtia.test", appUrl: "https://wtia.test"});
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({
      template, locale: "zh-HK", classification: "transactional", recipientName: "Ada",
      variables: expect.objectContaining({eventTitle: "人工智能診所", ctaUrl: "https://wtia.test/zh/events/ai-clinic"}),
    }));
    expect(transport.sends).toHaveLength(2);
    expect(transport.sends[0]?.idempotencyKey).toBe(memberRsvpIdempotencyKey(kind, eventId, profileId));
    expect(transport.sends[1]?.idempotencyKey).toBe(transport.sends[0]?.idempotencyKey);
  });

  it("does not call the provider from the production entry during tests", async () => {
    await expect(deliverMemberRsvpNotice({
      to: "ada@example.test", recipientName: "Ada", locale: "en", kind: "registered",
      eventId, profileId, eventTitle: "Clinic", slug: "clinic",
    })).resolves.toBeUndefined();
  });
});
