import {describe, expect, it} from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";

import {parseMemberImport} from "@/lib/admin/imports/parse";
import {validateMemberImportRows} from "@/lib/admin/imports/validate";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("member import parser and validation", () => {
  it("parses a BOM, quoted newline and Chinese names without shifting columns", async () => {
    const parsed = await parseMemberImport(bytes('\uFEFFName,Email,Locale\r\n"陳, 小明\n先生",ming@example.test,zh-HK\r\n'), "csv");
    expect(parsed.headers).toEqual(["Name", "Email", "Locale"]);
    expect(parsed.rows).toEqual([{rowNumber: 2, cells: {Name: "陳, 小明\n先生", Email: "ming@example.test", Locale: "zh-HK"}}]);
    expect(validateMemberImportRows(parsed, {displayName: "Name", email: "Email", locale: "Locale"})).toMatchObject([{status: "new_contact_candidate", values: {displayName: "陳, 小明\n先生", email: "ming@example.test", locale: "zh-HK"}}]);
  });

  it("rejects duplicate email, invalid locale/plan/date and unmapped privileged fields", async () => {
    const parsed = await parseMemberImport(bytes('Email,Locale,Plan,Renewal\nA@Example.test,en,community,2026-12-31\na@example.test,en,community,2026-12-31\nb@example.test,xx,corporate,2026-13-01\nc@example.test,en,invalid,2026-12-31\n'), "csv");
    const rows = validateMemberImportRows(parsed, {email: "Email", locale: "Locale", planCode: "Plan", renewalAt: "Renewal"});
    expect(rows.map((row) => row.status)).toEqual(["new_contact_candidate", "duplicate", "invalid", "invalid"]);
    expect(rows[0]?.values.email).toBe("a@example.test");
    expect(() => validateMemberImportRows(parsed, {email: "Email", consentMarketing: "Yes"} as never)).toThrow();
  });

  it("keeps blank cells absent so a later update cannot erase existing data", async () => {
    const parsed = await parseMemberImport(bytes('Member ID,Name,Locale\np-1,,\n'), "csv");
    const [row] = validateMemberImportRows(parsed, {profileId: "Member ID", displayName: "Name", locale: "Locale"});
    expect(row).toMatchObject({status: "update_candidate", values: {profileId: "p-1"}});
    expect(row?.values).not.toHaveProperty("displayName");
    expect(row?.values).not.toHaveProperty("locale");
  });

  it("rejects over 5000 CSV rows instead of silently truncating them", async () => {
    const csv = `Email\n${Array.from({length: 5001}, (_, index) => `person${index}@example.test`).join("\n")}\n`;
    await expect(parseMemberImport(bytes(csv), "csv")).rejects.toThrow("IMPORT_TOO_MANY_ROWS");
  });

  it("reads literal XLSX values but refuses formula and external hyperlink cells", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Members");
    sheet.addRow(["Name", "Email"]);
    sheet.addRow(["阿明", "ming@example.test"]);
    const literal = await workbook.xlsx.writeBuffer();
    const parsed = await parseMemberImport(new Uint8Array(literal), "xlsx");
    expect(parsed.rows[0]?.cells).toEqual({Name: "阿明", Email: "ming@example.test"});
    sheet.getCell("A2").value = {formula: '1+1', result: 2};
    const formula = await workbook.xlsx.writeBuffer();
    await expect(parseMemberImport(new Uint8Array(formula), "xlsx")).rejects.toThrow("IMPORT_FORMULA_FORBIDDEN");
    sheet.getCell("A2").value = {text: "Open", hyperlink: "https://evil.example"};
    const link = await workbook.xlsx.writeBuffer();
    await expect(parseMemberImport(new Uint8Array(link), "xlsx")).rejects.toThrow("IMPORT_EXTERNAL_LINK_FORBIDDEN");
    const zip = await JSZip.loadAsync(literal);
    zip.file("xl/externalLinks/externalLink1.xml", "<externalLink/>");
    await expect(parseMemberImport(new Uint8Array(await zip.generateAsync({type: "uint8array"})), "xlsx")).rejects.toThrow("IMPORT_EXTERNAL_LINK_FORBIDDEN");
  });
});
