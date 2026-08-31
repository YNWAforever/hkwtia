import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const state = vi.hoisted(() => ({
  messages: {} as Record<string, Record<string, string>>,
  forms: [] as Array<Record<string, unknown>>,
  lifecycle: [] as Array<Record<string, unknown>>,
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn(async ({locale}: {locale: string}) => (key: string) => state.messages[locale][key]),
}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn(async () => ({kind: "staff", userId: "staff", profileId: "staff"}))}));
vi.mock("@/lib/db/repos/announcements", () => ({
  announcementsRepository: {
    listForAdmin: (...args: unknown[]) => state.list(...args),
    getForAdmin: (...args: unknown[]) => state.get(...args),
  },
}));
vi.mock("@/lib/admin/announcement-actions", () => ({
  createAnnouncementAction: (...args: unknown[]) => state.create(...args),
  updateAnnouncementAction: (...args: unknown[]) => state.update(...args),
  setAnnouncementPublishedAction: (...args: unknown[]) => state.publish(...args),
  setAnnouncementArchivedAction: (...args: unknown[]) => state.archive(...args),
}));
vi.mock("@/components/admin/announcement-form", () => ({
  AnnouncementForm: (props: Record<string, unknown>) => {
    state.forms.push(props);
    const labels = props.labels as Record<string, string>;
    const values = (props.values ?? {}) as Record<string, string>;
    return <form aria-label={labels.save}>
      <label>{labels.titleEn}<input defaultValue={values.titleEn} name="titleEn"/></label>
      <label>{labels.titleZhHk}<input defaultValue={values.titleZhHk} name="titleZhHk"/></label>
      <button type="submit">{labels.save}</button>
    </form>;
  },
  AnnouncementLifecycleControls: (props: Record<string, unknown>) => {
    state.lifecycle.push(props);
    const labels = props.labels as Record<string, string>;
    return <section aria-label="lifecycle"><button>{labels.publish}</button><button>{labels.archive}</button></section>;
  },
}));

import AdminAnnouncementDetailPage from "@/app/[locale]/(admin)/admin/announcements/[id]/page";
import AdminAnnouncementsPage from "@/app/[locale]/(admin)/admin/announcements/page";

const id = "11111111-1111-4111-8111-111111111111";
const row = {
  id,
  titleEn: "English announcement",
  titleZhHk: "中文公告",
  ctaLabelEn: "Read more",
  ctaLabelZhHk: "閱讀更多",
  href: "/news",
  startsAt: new Date("2026-08-28T00:00:00.000Z"),
  endsAt: new Date("2026-08-29T00:00:00.000Z"),
  priority: 10,
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date("2026-08-27T00:00:00.000Z"),
  updatedAt: new Date("2026-08-27T00:00:00.000Z"),
};

describe("rendered announcement admin pages", () => {
  beforeEach(() => {
    state.messages = {
      en: en.Admin.announcements as unknown as Record<string, string>,
      "zh-HK": zh.Admin.announcements as unknown as Record<string, string>,
    };
    state.forms = [];
    state.lifecycle = [];
    state.list.mockReset().mockResolvedValue([]);
    state.get.mockReset().mockResolvedValue(row);
    state.create.mockReset().mockResolvedValue({status: "success"});
    state.update.mockReset().mockResolvedValue({status: "success"});
    state.publish.mockReset().mockResolvedValue({status: "success"});
    state.archive.mockReset().mockResolvedValue({status: "success"});
  });

  it("renders the localized create page and wires the bound create action", async () => {
    render(await AdminAnnouncementsPage({params: Promise.resolve({locale: "zh-HK"})}));

    expect(screen.getByRole("heading", {name: zh.Admin.announcements.title})).toBeInTheDocument();
    expect(screen.getByLabelText(zh.Admin.announcements.titleEn)).toBeInTheDocument();
    expect(screen.getByLabelText(zh.Admin.announcements.titleZhHk)).toBeInTheDocument();
    const action = state.forms[0].action as (previous: unknown, formData: FormData) => Promise<unknown>;
    const data = new FormData();
    await action({}, data);
    expect(state.create).toHaveBeenCalledWith(
      "/zh-HK/admin/announcements",
      {
        successMessage: zh.Admin.announcements.createSuccess,
        validationMessage: zh.Admin.announcements.validation,
        errorMessage: zh.Admin.announcements.error,
      },
      {},
      data,
    );
  });

  it("renders retained edit values and wires update, publish, and archive actions", async () => {
    render(await AdminAnnouncementDetailPage({params: Promise.resolve({locale: "en", id})}));

    expect(screen.getByRole("heading", {name: row.titleEn})).toBeInTheDocument();
    expect(screen.getByLabelText(en.Admin.announcements.titleEn)).toHaveValue(row.titleEn);
    expect(screen.getByLabelText(en.Admin.announcements.titleZhHk)).toHaveValue(row.titleZhHk);
    expect(screen.getByRole("button", {name: en.Admin.announcements.publish})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: en.Admin.announcements.archive})).toBeInTheDocument();

    const data = new FormData();
    await (state.forms[0].action as (previous: unknown, formData: FormData) => Promise<unknown>)({}, data);
    expect(state.update).toHaveBeenCalledWith(
      id,
      `/en/admin/announcements/${id}`,
      {
        successMessage: en.Admin.announcements.updateSuccess,
        validationMessage: en.Admin.announcements.validation,
        errorMessage: en.Admin.announcements.error,
      },
      {},
      data,
    );

    const lifecycle = state.lifecycle[0];
    await (lifecycle.publishAction as (previous: unknown, formData: FormData) => Promise<unknown>)({}, data);
    await (lifecycle.archiveAction as (previous: unknown, formData: FormData) => Promise<unknown>)({}, data);
    expect(state.publish).toHaveBeenCalledWith(id, `/en/admin/announcements/${id}`, true, {}, data);
    expect(state.archive).toHaveBeenCalledWith(id, `/en/admin/announcements/${id}`, true, {}, data);
  });
});
