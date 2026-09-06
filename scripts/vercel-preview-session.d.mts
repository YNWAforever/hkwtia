// Type surface for the ESM script: tsconfig sets `allowJs: false`, so the unit test that imports
// `previewSessionPlan` needs this declaration to typecheck (TS7016 otherwise).
export const STATE_PATH: ".playwright/preview-state.json";
export const COOKIE_PATH: ".playwright/preview-cookie.txt";

export interface PreviewSessionPlan {
  origin: string;
  /** The trimmed share url the browser navigates to. Carries the token: never log it. */
  shareUrl: string;
  statePath: typeof STATE_PATH;
  cookiePath: typeof COOKIE_PATH;
}

export function previewSessionPlan(env: Record<string, string | undefined>): PreviewSessionPlan;

/** The script's own error code when `error` carries one, otherwise `PREVIEW_SESSION_FAILED`. */
export function failureMessage(error: unknown): string;
