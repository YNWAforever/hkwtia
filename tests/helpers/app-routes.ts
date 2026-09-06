import {readdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";

function filesNamed(directory: string, fileName: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((item) => {
    const path = join(directory, item.name);
    if (item.isDirectory()) return filesNamed(path, fileName);
    return item.isFile() && item.name === fileName ? [path] : [];
  });
}

function appRouteForPage(appRoot: string, file: string): string {
  const segments = relative(appRoot, file)
    .replaceAll("\\", "/")
    .split("/")
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Every page route under `app/[locale]`, as the App Router sees it: route groups stripped,
 * dynamic segments kept in bracket form (`/events/[slug]`, `/about/history`,
 * `/portal/company/seats`). This is the real destination surface, so redirect and parity tests
 * check against it rather than a hand-maintained list that drifts as pages are added.
 */
export function listAppRoutes(root = process.cwd()): string[] {
  const appRoot = resolve(root, "app", "[locale]");
  return filesNamed(appRoot, "page.tsx").map((file) => appRouteForPage(appRoot, file));
}
