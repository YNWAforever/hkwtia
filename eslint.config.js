import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([".next/**", "coverage/**", "playwright-report/**", "test-results/**"]),
  {
    files: ["lib/**/*.{ts,tsx}"],
    ignores: ["lib/db/repos/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {name: "@/lib/db/client", message: "Database access belongs in lib/db/repos."},
          {name: "@/lib/db/repos/common", message: "Repository helpers belong in lib/db/repos."},
        ],
      }],
    },
  },
]);
