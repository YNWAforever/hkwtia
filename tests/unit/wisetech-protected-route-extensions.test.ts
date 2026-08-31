import {describe, expect, it} from "vitest";

import {appRouteFromFilePath} from "@/lib/integration/protected-route-ownership";

describe("WiseTech protected-route file extensions", () => {
  it("normalizes every page and route extension in the installed Next default", () => {
    const cases = [
      ["app/(group)/[locale]/admin/extensions/tsx/page.tsx", "/admin/extensions/tsx"],
      ["app/@slot/[locale]/admin/extensions/ts/page.ts", "/admin/extensions/ts"],
      ["app/[locale]/@modal/(.)admin/extensions/jsx/page.jsx", "/admin/extensions/jsx"],
      ["app/(group)/[locale]/admin/extensions/js/page.js", "/admin/extensions/js"],
      ["app/(server)/api/extensions/tsx/route.tsx", "/api/extensions/tsx"],
      ["app/@slot/(...)[locale]/api/extensions/ts/route.ts", "/api/extensions/ts"],
      ["app/(server)/[locale]/api/extensions/jsx/route.jsx", "/api/extensions/jsx"],
      ["app/api/extensions/js/route.js", "/api/extensions/js"],
    ] as const;

    for (const [filePath, routePath] of cases) {
      expect(appRouteFromFilePath(filePath), filePath).toBe(routePath);
    }
  });

  it("rejects nonconfigured extensions and near convention names", () => {
    for (const filePath of [
      "app/[locale]/admin/extensions/page.css",
      "app/api/extensions/route.json",
      "app/[locale]/admin/extensions/pages.ts",
      "app/api/extensions/routes.js",
      "app/[locale]/admin/extensions/page.ts.bak",
    ]) {
      expect(() => appRouteFromFilePath(filePath), filePath).toThrow(
        /valid app\/\*\*\/page\.\{tsx,ts,jsx,js\} or app\/\*\*\/route\.\{tsx,ts,jsx,js\}/,
      );
    }
  });
});
