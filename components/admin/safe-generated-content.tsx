import {SafeStructuredContent} from "@/components/content/safe-structured-content";

type TableHeaders = Readonly<{
  kpi: string;
  value: string;
}>;

export function SafeGeneratedContent(
  {content, tableHeaders}: Readonly<{
    content: string;
    tableHeaders: TableHeaders;
  }>,
) {
  return (
    <SafeStructuredContent
      content={content}
      mode="board-report"
      tableHeaders={tableHeaders}
    />
  );
}
