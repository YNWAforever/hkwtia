import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {
  appRouteFromFilePath,
  isProtectedAdminRoute,
} from "@/lib/integration/route-parity";

function appRouteConventionFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return appRouteConventionFiles(path);
    return item.isFile() && (item.name === "page.tsx" || item.name === "route.ts") ? [path] : [];
  });
}

export function repositoryProtectedFiles(root = process.cwd()): string[] {
  return appRouteConventionFiles(resolve(root, "app"))
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => {
      const route = appRouteFromFilePath(file);
      if (route === null) return false;
      if (file.endsWith("/page.tsx")) return isProtectedAdminRoute(route);
      return route === "/api" || route.startsWith("/api/");
    })
    .sort();
}
