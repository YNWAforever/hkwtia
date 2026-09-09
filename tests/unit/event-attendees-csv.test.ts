import {describe, expect, it, vi} from "vitest";

import {attendeesCsv, createAttendeesCsvGet} from "@/lib/admin/event-attendees";
import {listEventAttendees, type EventAttendee} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const EVENT = "22222222-2222-4222-8222-222222222222";
const staff: Actor = {kind: "staff", userId: "s", profileId: "s1"};
const rows: EventAttendee[] = [
  {kind: "member", profileId: "p1", guestId: null, displayName: "Ada", email: "ada@x.hk", organisation: null, status: "registered", checkedInAt: null},
  {kind: "guest", profileId: null, guestId: "g1", displayName: 'Bob "B"', email: "bob@x.hk", organisation: "Acme, Ltd", status: "waitlist", checkedInAt: null},
];

function request() {
  return new Request(`https://x/api/admin/events/${EVENT}/attendees.csv`);
}

describe("attendee CSV (programme B-4)", () => {
  it("quotes fields and lists members and guests", () => {
    const csv = attendeesCsv(rows);
    // BOM + CRLF match `encodeMemberCsv`, so Excel opens Chinese names cleanly.
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).split("\r\n")[0]).toBe("kind,name,email,organisation,status,checked_in_at");
    expect(csv).toContain('member,Ada,ada@x.hk,,registered,\r\n');
    expect(csv).toContain('guest,"Bob ""B""",bob@x.hk,"Acme, Ltd",waitlist,\r\n');
  });

  it("neutralises spreadsheet formulas in guest-supplied fields and writes check-in times as ISO", () => {
    const csv = attendeesCsv([{...rows[1], displayName: "=HYPERLINK(\"x\")", organisation: null, checkedInAt: new Date("2030-03-01T02:00:00.000Z")}]);
    expect(csv).toContain('guest,"\'=HYPERLINK(""x"")",bob@x.hk,,waitlist,2030-03-01T02:00:00.000Z');
  });

  it("returns 404 for a non-admin and a csv attachment for staff", async () => {
    const list = vi.fn(async () => rows);
    const audit = vi.fn(async () => undefined);
    const denied = createAttendeesCsvGet({actor: async () => { throw new Error("UNAUTHORIZED"); }, list, audit});
    expect((await denied(request(), {params: Promise.resolve({id: EVENT})})).status).toBe(404);
    const member = createAttendeesCsvGet({actor: async () => ({kind: "member", userId: "m", profileId: "m1"}), list, audit});
    expect((await member(request(), {params: Promise.resolve({id: EVENT})})).status).toBe(404);
    expect(list).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    const ok = createAttendeesCsvGet({actor: async () => staff, list, audit});
    expect((await ok(request(), {params: Promise.resolve({id: "not-a-uuid"})})).status).toBe(404);
    const response = await ok(request(), {params: Promise.resolve({id: EVENT})});
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain(`attendees-${EVENT}.csv`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // `Response.text()` strips a leading BOM by spec, so check the bytes for it.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(attendeesCsv(rows).slice(1));
    expect(list).toHaveBeenCalledWith(staff, EVENT);
  });

  it("404s for an unknown event and never audits it", async () => {
    const list = vi.fn(async () => null);
    const audit = vi.fn(async () => undefined);
    const get = createAttendeesCsvGet({actor: async () => staff, list, audit});
    const response = await get(request(), {params: Promise.resolve({id: EVENT})});
    expect(response.status).toBe(404);
    expect(list).toHaveBeenCalledWith(staff, EVENT);
    expect(audit).not.toHaveBeenCalled();
  });

  it("audits every export with the row count, before the file leaves", async () => {
    const audit = vi.fn(async () => undefined);
    const get = createAttendeesCsvGet({actor: async () => staff, list: async () => rows, audit});
    await get(request(), {params: Promise.resolve({id: EVENT})});
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(staff, EVENT, 2);

    const failing = createAttendeesCsvGet({actor: async () => staff, list: async () => rows, audit: async () => { throw new Error("AUDIT_DOWN"); }});
    await expect(failing(request(), {params: Promise.resolve({id: EVENT})})).rejects.toThrow("AUDIT_DOWN");
  });
});

describe("listEventAttendees (programme B-4)", () => {
  it("maps the member/guest union rows and requires an admin", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{id: EVENT}])
      .mockResolvedValueOnce([
        {kind: "member", profile_id: "p1", guest_id: null, display_name: "Ada", email: "ada@x.hk", organisation: null, status: "registered", checked_in_at: "2030-03-01T02:00:00.000Z"},
        {kind: "guest", profile_id: null, guest_id: "33333333-3333-4333-8333-333333333333", display_name: "Bob", email: "bob@x.hk", organisation: "Acme", status: "waitlist", checked_in_at: null},
      ]);
    const loadDatabase = async () => ({execute, transaction: async () => { throw new Error("unused"); }}) as never;
    await expect(listEventAttendees({kind: "member", userId: "m", profileId: "m1"}, EVENT, {loadDatabase})).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();

    const attendees = await listEventAttendees(staff, EVENT, {loadDatabase});
    expect(attendees).toEqual([
      {kind: "member", profileId: "p1", guestId: null, displayName: "Ada", email: "ada@x.hk", organisation: null, status: "registered", checkedInAt: new Date("2030-03-01T02:00:00.000Z")},
      {kind: "guest", profileId: null, guestId: "33333333-3333-4333-8333-333333333333", displayName: "Bob", email: "bob@x.hk", organisation: "Acme", status: "waitlist", checkedInAt: null},
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("returns null for an unknown event without querying attendees", async () => {
    const execute = vi.fn(async () => []);
    const loadDatabase = async () => ({execute, transaction: async () => { throw new Error("unused"); }}) as never;
    const attendees = await listEventAttendees(staff, EVENT, {loadDatabase});
    expect(attendees).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
