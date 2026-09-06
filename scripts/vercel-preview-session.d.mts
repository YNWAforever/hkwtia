// Type surface for the ESM script: tsconfig sets `allowJs: false`, so the unit test that imports
// `previewSessionPlan` needs this declaration to typecheck (TS7016 otherwise).
export const STATE_PATH: ".playwright/preview-state.json";
export const COOKIE_PATH: ".playwright/preview-cookie.txt";

export interface PreviewSessionPlan {
  origin: string;
  statePath: typeof STATE_PATH;
  cookiePath: typeof COOKIE_PATH;
}

export function previewSessionPlan(env: Record<string, string | undefined>): PreviewSessionPlan;
