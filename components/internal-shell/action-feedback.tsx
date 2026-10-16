export type InternalFeedbackTone = "success" | "error";

export function InternalActionFeedback({tone, message}: Readonly<{tone: InternalFeedbackTone; message: string}>) {
  return (
    <p role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? undefined : "polite"} className={tone === "error" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-green-700 dark:text-green-400"}>
      {message}
    </p>
  );
}
