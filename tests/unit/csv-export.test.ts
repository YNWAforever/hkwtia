import {describe, expect, it} from "vitest";

import {csvCell, encodeMemberCsv} from "@/lib/admin/csv";

describe("member CSV export", () => {
  it.each(["=2+2", "+cmd", "-1+1", "@SUM(A1)"])("neutralizes %s", (value) => {
    expect(csvCell(value)).toBe(`'${value}`);
  });

  it("uses a UTF-8 BOM, fixed header order, RFC 4180 quoting, and CRLF endings", () => {
    const csv = encodeMemberCsv([{
      profileId: "profile-1",
      displayName: "Ada, \"Ace\"",
      email: "=formula@example.test",
      companyName: "Acme\nLimited",
      planCode: "corporate",
      membershipStatus: "active",
      renewalAt: "2026-09-01T00:00:00.000Z",
      score: 19,
    }]);

    expect(csv).toBe("\uFEFFprofileId,displayName,email,companyName,planCode,membershipStatus,renewalAt,score\r\nprofile-1,\"Ada, \"\"Ace\"\"\",'=formula@example.test,\"Acme\nLimited\",corporate,active,2026-09-01T00:00:00.000Z,19\r\n");
  });
});
