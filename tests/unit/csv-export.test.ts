import {describe, expect, it} from "vitest";

import {csvCell, encodeAudienceCsv} from "@/lib/admin/csv";

describe("member CSV export", () => {
  it.each(["=2+2", "+cmd", "-1+1", "@SUM(A1)"])("neutralizes %s", (value) => {
    expect(csvCell(value)).toBe(`'${value}`);
  });

  it("uses a UTF-8 BOM, fixed header order, RFC 4180 quoting, and CRLF endings", () => {
    const csv = encodeAudienceCsv([{
      kind: "member",
      id: "profile-1",
      displayName: "Ada, \"Ace\"",
      email: "=formula@example.test",
      companyName: "Acme\nLimited",
      planCode: "corporate",
      membershipStatus: "active",
      renewalAt: "2026-09-01T00:00:00.000Z",
      score: 19,
      whatsappNumber: "+85290000000",
      whatsappOptIn: true,
      contactStage: null,
      contactSource: null,
    }]);

    expect(csv).toBe("\uFEFFkind,id,displayName,email,companyName,planCode,membershipStatus,renewalAt,score,whatsappNumber,whatsappOptIn,contactStage,contactSource\r\nmember,profile-1,\"Ada, \"\"Ace\"\"\",'=formula@example.test,\"Acme\nLimited\",corporate,active,2026-09-01T00:00:00.000Z,19,'+85290000000,true,,\r\n");
  });

  // C-6. The contact arm carries the columns the member arm cannot, and vice
  // versa; one header for both is what lets a "members and contacts" export
  // open as a single sheet instead of two shapes glued together.
  it("writes a contact row through the same header with the member-only columns blank", () => {
    const csv = encodeAudienceCsv([{
      kind: "contact",
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Prospect One",
      email: "prospect@example.test",
      companyName: null,
      planCode: null,
      membershipStatus: null,
      renewalAt: null,
      score: null,
      whatsappNumber: null,
      whatsappOptIn: false,
      contactStage: "qualified",
      contactSource: "whatsapp",
    }], false);

    expect(csv).toBe("contact,11111111-1111-4111-8111-111111111111,Prospect One,prospect@example.test,,,,,,,false,qualified,whatsapp\r\n");
  });

  it.each([
    [" =SUM(1,1)", "\"' =SUM(1,1)\""],
    ["\t@cmd", "'\t@cmd"],
    ["  -1+2", "'  -1+2"],
    [" \t=SUM(\"a,b\")\r\n", "\"' \t=SUM(\"\"a,b\"\")\r\n\""],
  ])("neutralizes a whitespace-prefixed formula %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });
});
