import "server-only";

import {parse as parseCsv} from "csv-parse/sync";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export const MAX_MEMBER_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_MEMBER_IMPORT_ROWS = 5000;
const MAX_COLUMNS = 50;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export type ParsedImportRow = Readonly<{rowNumber: number; cells: Readonly<Record<string, string>>}>;
export type ParsedMemberImport = Readonly<{headers: readonly string[]; rows: readonly ParsedImportRow[]}>;

function headersFrom(values: readonly string[]): string[] {
  const headers = values.map((value) => value.trim());
  if (!headers.length || headers.length > MAX_COLUMNS || headers.some((value) => !value || value.length > 100) || new Set(headers.map((value) => value.toLocaleLowerCase("en"))).size !== headers.length) throw new Error("IMPORT_HEADERS_INVALID");
  return headers;
}
function recordsFrom(values: readonly (readonly string[])[]): ParsedMemberImport {
  if (!values.length) throw new Error("IMPORT_EMPTY");
  const headers = headersFrom(values[0]!);
  if (values.length - 1 > MAX_MEMBER_IMPORT_ROWS) throw new Error("IMPORT_TOO_MANY_ROWS");
  const rows = values.slice(1).map((record, index) => {
    if (record.length !== headers.length || record.some((value) => value.length > 20_000)) throw new Error("IMPORT_ROW_INVALID");
    return {rowNumber: index + 2, cells: Object.fromEntries(headers.map((name, column) => [name, record[column]!]))};
  });
  return {headers, rows};
}
function plainCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) throw new Error("IMPORT_FORMULA_FORBIDDEN");
  if (typeof value === "object" && "hyperlink" in value) throw new Error("IMPORT_EXTERNAL_LINK_FORBIDDEN");
  throw new Error("IMPORT_CELL_UNSUPPORTED");
}
async function xlsxRecords(bytes: Uint8Array): Promise<ParsedMemberImport> {
  const zip = await JSZip.loadAsync(bytes, {checkCRC32: true});
  let uncompressed = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (/(^|\/)(vbaproject\.bin|externallinks)(\/|$)/iu.test(name) || /\.bin$/iu.test(name)) throw new Error("IMPORT_EXTERNAL_LINK_FORBIDDEN");
    const size = (entry as unknown as {_data?: {uncompressedSize?: number}})._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size! < 0) throw new Error("IMPORT_XLSX_UNSAFE");
    uncompressed += size!;
    if (uncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("IMPORT_XLSX_TOO_LARGE");
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml || /<externalReferences(?:\s|>)/iu.test(workbookXml)) throw new Error("IMPORT_EXTERNAL_LINK_FORBIDDEN");
  const workbook = new ExcelJS.Workbook();
  // ExcelJS carries a different Node Buffer declaration than this app; the runtime value is a real Buffer.
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length !== 1 || workbook.worksheets[0]?.state !== "visible") throw new Error("IMPORT_SINGLE_VISIBLE_SHEET_REQUIRED");
  const sheet = workbook.worksheets[0]!;
  if (sheet.rowCount > MAX_MEMBER_IMPORT_ROWS + 1 || sheet.columnCount > MAX_COLUMNS) throw new Error("IMPORT_TOO_MANY_ROWS");
  const headerRow = sheet.getRow(1);
  const headers = headersFrom(Array.from({length: sheet.columnCount}, (_, index) => plainCell(headerRow.getCell(index + 1).value)));
  const rows: ParsedImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = headers.map((_, index) => plainCell(row.getCell(index + 1).value));
    if (values.every((value) => value === "")) continue;
    if (values.some((value) => value.length > 20_000)) throw new Error("IMPORT_ROW_INVALID");
    rows.push({rowNumber, cells: Object.fromEntries(headers.map((name, index) => [name, values[index]!]))});
  }
  return {headers, rows};
}

export async function parseMemberImport(bytes: Uint8Array, kind: "csv" | "xlsx"): Promise<ParsedMemberImport> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEMBER_IMPORT_BYTES) throw new Error("IMPORT_SIZE_INVALID");
  if (kind === "xlsx") return xlsxRecords(bytes);
  if (kind !== "csv") throw new Error("IMPORT_TYPE_UNSUPPORTED");
  const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  const parsed = parseCsv(text, {bom: true, skip_empty_lines: true, relax_column_count: false, max_record_size: 20_000, to: MAX_MEMBER_IMPORT_ROWS + 2}) as string[][];
  return recordsFrom(parsed);
}
