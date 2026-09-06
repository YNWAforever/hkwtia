// Type surface for the ESM Lighthouse CI config: tsconfig sets `allowJs: false`, so the unit test
// that imports it (tests/unit/preview-session-harness.test.ts) needs this declaration (TS7016
// otherwise). Only the fields the test asserts on are typed.
export interface LighthouseCiConfig {
  collect: {
    url: string[];
    numberOfRuns: number;
    startServerCommand: string | undefined;
    startServerReadyPattern: string;
    startServerReadyTimeout: number;
    settings: {chromeFlags: string; extraHeaders?: {Cookie: string}};
  };
  assert: {assertions: Record<string, [string, {minScore: number}]>};
  upload: {target: "temporary-public-storage"} | {target: "filesystem"; outputDir: string};
}

export const ci: LighthouseCiConfig;
declare const config: {ci: LighthouseCiConfig};
export default config;
