import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
const repositories = vi.hoisted(() => ({ events: vi.fn(), plans: vi.fn() }));
vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: { listPublic: repositories.events },
}));
vi.mock("@/lib/db/repos/membership-plans", () => ({
  membershipPlansRepository: { list: repositories.plans },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({
    namespace,
    locale,
  }: {
    namespace?: string;
    locale: string;
  }) => {
    const bundle = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    const raw = (key: string) =>
      (namespace ? namespace + "." + key : key)
        .split(".")
        .reduce(
          (value: Record<string, unknown>, part) =>
            value?.[part] as Record<string, unknown>,
          bundle,
        );
    return Object.assign((key: string) => String(raw(key)), { raw });
  },
}));
import EventsPage from "@/app/[locale]/(public)/events/page";
import MembershipPage from "@/app/[locale]/(public)/membership/page";
import { PageHero } from "@/components/wt/page-hero";
describe("public hero streaming", () => {
  for (const kind of ["events", "membership"] as const)
    it(`${kind} exposes its hero while the repository is still pending`, async () => {
      let release!: (value: never[]) => void;
      const pending = new Promise<never[]>((resolve) => {
        release = resolve;
      });
      repositories[kind === "events" ? "events" : "plans"].mockReturnValueOnce(
        pending,
      );
      let result: ReactElement<{ children: ReactElement[] }> | undefined;
      const page = (
        kind === "events"
          ? EventsPage({
              params: Promise.resolve({ locale: "en" }),
              searchParams: Promise.resolve({}),
            })
          : MembershipPage({ params: Promise.resolve({ locale: "en" }) })
      ).then((value) => {
        result = value;
      });
      try {
        await vi.waitFor(
          () =>
            expect(
              result,
              "The hero must not wait for the catalogue read",
            ).toBeDefined(),
          { timeout: 500, interval: 20 },
        );
        expect(
          result!.props.children.some(
            (child) => isValidElement(child) && child.type === PageHero,
          ),
        ).toBe(true);
      } finally {
        release([]);
        await page;
      }
    });
});
