import type {ReactNode} from "react";

const REPORT_TITLE = /^Board report: \d{4}-(0[1-9]|1[0-2])$/;
const SECTION_HEADINGS = new Set([
  "Key performance indicators",
  "Executive summary",
  "Highlights",
  "Risks",
  "Recommended actions",
  "App links",
]);
const KPI_HEADER = "| KPI | Value |";
const KPI_SEPARATOR = "| --- | ---: |";
const KPI_ROW = /^\| ([^|\n]+) \| ([^|\n]+) \|$/;
const INLINE_TOKEN =
  /\*\*([^*\n]+)\*\*|(?<!!)\[([^\]\n]+)\]\((\/(?!\/)[A-Za-z0-9/_?=&.%#~-]*)\)/g;

export type SafeStructuredContentMode =
  | "board-report"
  | "build-log";

type TableHeaders = Readonly<{
  kpi: string;
  value: string;
}>;

function inlineNodes(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(INLINE_TOKEN)) {
    const index = match.index;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    if (match[1]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`}>{match[1]}</strong>,
      );
    } else {
      nodes.push(
        <a
          className="font-medium text-primary underline underline-offset-4"
          href={match[3]}
          key={`${keyPrefix}-link-${tokenIndex}`}
        >
          {match[2]}
        </a>,
      );
    }
    cursor = index + match[0].length;
    tokenIndex += 1;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function isBuildLogHeading(value: string): boolean {
  return value.length >= 1
    && value.length <= 120
    && !/[<>{}]/.test(value);
}

function safeBlocks(
  content: string,
  mode: SafeStructuredContentMode,
  tableHeaders: TableHeaders,
): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.length === 0) {
      index += 1;
      continue;
    }

    if (
      mode === "board-report"
      && line.startsWith("# ")
      && REPORT_TITLE.test(line.slice(2))
    ) {
      blocks.push(
        <h1 className="font-serif text-3xl font-semibold" key={`block-${index}`}>
          {line.slice(2)}
        </h1>,
      );
      index += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      const heading = line.slice(3);
      const accepted =
        mode === "board-report"
          ? SECTION_HEADINGS.has(heading)
          : isBuildLogHeading(heading);
      if (accepted) {
        blocks.push(
          <h2 className="font-serif text-2xl font-semibold" key={`block-${index}`}>
            {heading}
          </h2>,
        );
        index += 1;
        continue;
      }
    }

    if (
      mode === "board-report"
      && line === KPI_HEADER
      && lines[index + 1] === KPI_SEPARATOR
    ) {
      const rows: Array<{label: string; value: string}> = [];
      let rowIndex = index + 2;
      for (; rowIndex < lines.length; rowIndex += 1) {
        const row = KPI_ROW.exec(lines[rowIndex]);
        if (!row) break;
        rows.push({label: row[1], value: row[2]});
      }
      blocks.push(
        <div className="overflow-x-auto" key={`block-${index}`}>
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2" scope="col">{tableHeaders.kpi}</th>
                <th className="px-3 py-2" scope="col">{tableHeaders.value}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, tableIndex) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={`${row.label}-${tableIndex}`}
                >
                  <th className="px-3 py-2 font-medium" scope="row">
                    {inlineNodes(row.label, `table-label-${tableIndex}`)}
                  </th>
                  <td className="px-3 py-2">
                    {inlineNodes(row.value, `table-value-${tableIndex}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = rowIndex;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      let itemIndex = index;
      for (
        ;
        itemIndex < lines.length && lines[itemIndex].startsWith("- ");
        itemIndex += 1
      ) {
        items.push(lines[itemIndex].slice(2));
      }
      blocks.push(
        <ul className="list-disc space-y-1 pl-5" key={`block-${index}`}>
          {items.map((item, listIndex) => (
            <li key={`item-${listIndex}`}>
              {inlineNodes(item, `list-${index}-${listIndex}`)}
            </li>
          ))}
        </ul>,
      );
      index = itemIndex;
      continue;
    }

    blocks.push(
      <p
        className="whitespace-pre-wrap break-words leading-6"
        key={`block-${index}`}
      >
        {inlineNodes(line, `paragraph-${index}`)}
      </p>,
    );
    index += 1;
  }

  return blocks;
}

export function SafeStructuredContent({
  content,
  mode,
  tableHeaders,
}: Readonly<{
  content: string;
  mode: SafeStructuredContentMode;
  tableHeaders: TableHeaders;
}>) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4 text-foreground">
      {safeBlocks(content, mode, tableHeaders)}
    </div>
  );
}
