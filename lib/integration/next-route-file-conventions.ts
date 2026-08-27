export const defaultNextPageExtensions = Object.freeze([
  "tsx",
  "ts",
  "jsx",
  "js",
] as const);

export type NextAppRouteFileKind = "page" | "route";

const extensionPattern = defaultNextPageExtensions.join("|");
const appRouteFilePattern = new RegExp(`^(page|route)\\.(${extensionPattern})$`);

export function nextAppRouteFileKind(filePath: string): NextAppRouteFileKind | null {
  const fileName = filePath.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const match = appRouteFilePattern.exec(fileName);
  return match?.[1] === "page" || match?.[1] === "route" ? match[1] : null;
}

export function defaultNextRouteFileConventions(): string {
  const extensions = defaultNextPageExtensions.join(",");
  return `valid app/**/page.{${extensions}} or app/**/route.{${extensions}}`;
}
