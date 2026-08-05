import {describe, expect, it} from "vitest";

import manifest from "../../package.json";

describe("repository contract", () => {
  it("uses Next.js and exposes every required command", () => {
    expect(manifest.scripts).toMatchObject({
      dev: "next dev --webpack",
      build: "next build --webpack",
      start: "next start",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      "test:e2e": "playwright test",
    });
    expect(manifest.dependencies).toHaveProperty("next");
    expect(manifest.dependencies).toHaveProperty("next-intl");
    expect(manifest.dependencies).not.toHaveProperty("react-router-dom");
    expect(manifest.dependencies).not.toHaveProperty("@react-three/drei");
    expect(manifest.dependencies).not.toHaveProperty("three");
    expect(manifest.dependencies).not.toHaveProperty("next-themes");
    expect(manifest.dependencies).not.toHaveProperty("react-day-picker");
    expect(manifest.dependencies).not.toHaveProperty("vaul");
    expect(manifest.devDependencies).not.toHaveProperty("vite");
  });
});
