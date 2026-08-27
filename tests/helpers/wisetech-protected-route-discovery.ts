import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

import {nextAppRouteFileKind} from "@/lib/integration/next-route-file-conventions";
import {
  appRouteFromFilePath,
  isProtectedAdminRoute,
} from "@/lib/integration/route-parity";

function appRouteConventionFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return appRouteConventionFiles(path);
    return item.isFile() && nextAppRouteFileKind(item.name) !== null ? [path] : [];
  });
}

export function repositoryProtectedFiles(root = process.cwd()): string[] {
  return appRouteConventionFiles(resolve(root, "app"))
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => {
      const route = appRouteFromFilePath(file);
      if (route === null) return false;
      const kind = nextAppRouteFileKind(file);
      if (kind === "page") return isProtectedAdminRoute(route);
      return kind === "route" && (route === "/api" || route.startsWith("/api/"));
    })
    .sort();
}
