import { expect, it, vi } from "vitest";
import en from "@/messages/en.json";
const state = vi.hoisted(() => ({
  get: vi.fn(async () => ({ Home: { hero: { title: "Public synthetic" } } })),
  translate: vi.fn(async () => (key: string) => "public:" + key),
}));
vi.mock("next-intl/server", () => ({
  getMessages: state.get,
  getTranslations: state.translate,
}));
import { getHomeTranslations } from "@/lib/home/copy-preview";
it("applies explicit private copy only to that renderer and keeps a later public read unchanged", async () => {
  const privateT = await getHomeTranslations({
    locale: "en",
    namespace: "Home.hero",
    copyOverrides: [
      { namespace: "Home", keyPath: "hero.title", value: "Private synthetic" },
    ],
  });
  expect(privateT("title")).toBe("Private synthetic");
  const publicT = await getHomeTranslations({
    locale: "en",
    namespace: "Home.hero",
  });
  expect(publicT("title")).toBe("public:title");
  expect(state.get).toHaveBeenCalledOnce();
});
it("a cleared private override uses shipped copy even if public copy was overridden", async () => {
  const t = await getHomeTranslations({
    locale: "en",
    namespace: "Home.hero",
    copyOverrides: [{ namespace: "Home", keyPath: "hero.title", value: "" }],
  });
  expect(t("title")).toBe(en.Home.hero.title);
});
it("preserves array shape and ICU formatting in the actual translator", async () => {
  const t = await getHomeTranslations({
    locale: "en",
    namespace: "Home.legacyNetwork",
    copyOverrides: [
      {
        namespace: "Home",
        keyPath: "legacyNetwork.previewNote",
        value: "Synthetic {shown} / {total}",
      },
    ],
  });
  expect(t("previewNote", { shown: 2, total: 79 })).toBe("Synthetic 2 / 79");
});

it("retains actual bundled array values and does not mutate them while overlaying copy", async () => {
  const t = await getHomeTranslations({
    locale: "en",
    namespace: "Home.ecosystem",
    copyOverrides: [
      {
        namespace: "Home",
        keyPath: "ecosystem.title",
        value: "Private ecosystem",
      },
    ],
  });
  expect(t.raw("focusAreas")).toEqual(en.Home.ecosystem.focusAreas);
  expect(Array.isArray(t.raw("focusAreas"))).toBe(true);
  expect(t("title")).toBe("Private ecosystem");
  expect(en.Home.ecosystem.title).not.toBe("Private ecosystem");
});
