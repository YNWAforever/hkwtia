export type InternalStatusTone = "neutral" | "success" | "warning" | "error";

const toneClassName: Record<InternalStatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  error: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function InternalStatusBadge({tone, label}: Readonly<{tone: InternalStatusTone; label: string}>) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClassName[tone]}`}>
      {label}
    </span>
  );
}
