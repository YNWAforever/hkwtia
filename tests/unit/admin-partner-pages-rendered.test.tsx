import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const state = vi.hoisted(() => ({messages: {} as Record<string, Record<string, string>>, forms: [] as Array<Record<string, unknown>>, lifecycle: [] as Array<Record<string, unknown>>, partnerList: vi.fn(), partnerGet: vi.fn(), landingList: vi.fn(), landingGet: vi.fn(), mediaList: vi.fn(), createPartner: vi.fn(), updatePartner: vi.fn(), publishPartner: vi.fn(), archivePartner: vi.fn(), createLanding: vi.fn(), updateLanding: vi.fn(), publishLanding: vi.fn(), archiveLanding: vi.fn()}));
vi.mock("next-intl/server", () => ({setRequestLocale: vi.fn(), getTranslations: vi.fn(async ({locale}: {locale: string}) => (key: string) => state.messages[locale][key])}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn(async () => ({kind: "staff", userId: "staff", profileId: "staff"}))}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listForAdmin: (...args: unknown[]) => state.partnerList(...args), getForAdmin: (...args: unknown[]) => state.partnerGet(...args)}}));
vi.mock("@/lib/db/repos/landing-partners", () => ({landingPartnersRepository: {listForAdmin: (...args: unknown[]) => state.landingList(...args), getForAdmin: (...args: unknown[]) => state.landingGet(...args)}}));
vi.mock("@/lib/db/repos/media", () => ({mediaRepository: {listActiveForAdmin: (...args: unknown[]) => state.mediaList(...args)}}));
vi.mock("@/lib/admin/partner-actions", () => ({createPartnerAction: (...args: unknown[]) => state.createPartner(...args), updatePartnerAction: (...args: unknown[]) => state.updatePartner(...args), setPartnerPublishedAction: (...args: unknown[]) => state.publishPartner(...args), setPartnerArchivedAction: (...args: unknown[]) => state.archivePartner(...args)}));
vi.mock("@/lib/admin/landing-partner-actions", () => ({createLandingPartnerAction: (...args: unknown[]) => state.createLanding(...args), updateLandingPartnerAction: (...args: unknown[]) => state.updateLanding(...args), setLandingPartnerPublishedAction: (...args: unknown[]) => state.publishLanding(...args), setLandingPartnerArchivedAction: (...args: unknown[]) => state.archiveLanding(...args)}));
vi.mock("@/components/admin/partner-form", () => ({PartnerForm: (props: Record<string, unknown>) => { state.forms.push(props); return <form aria-label="partner-form"/>; }, PartnerLifecycleControls: (props: Record<string, unknown>) => { state.lifecycle.push(props); return <section aria-label="partner-lifecycle"/>; }}));
vi.mock("@/components/admin/landing-partner-form", () => ({LandingPartnerForm: (props: Record<string, unknown>) => { state.forms.push(props); return <form aria-label="landing-form"/>; }, PartnerLifecycleControls: (props: Record<string, unknown>) => { state.lifecycle.push(props); return <section aria-label="landing-lifecycle"/>; }}));

import PartnerDetailPage from "@/app/[locale]/(admin)/admin/partners/[id]/page";
import PartnersPage from "@/app/[locale]/(admin)/admin/partners/page";
import LandingDetailPage from "@/app/[locale]/(admin)/admin/landing-partners/[id]/page";
import LandingPage from "@/app/[locale]/(admin)/admin/landing-partners/page";

const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-28T00:00:00.000Z");
const partner = {id, nameEn: "Partner", nameZhHk: "夥伴", category: "regional", websiteUrl: null, logoMediaId: null, displayOrder: 0, featured: false, relationshipStartsOn: null, relationshipEndsOn: null, relationshipConfirmedAt: null, logoRightsConfirmedAt: null, publishedAt: null, archivedAt: null, createdAt: now, updatedAt: now};
const landing = {id, organizationEn: "Bridge", organizationZhHk: "橋樑", market: "SG", region: "Asia", mouStatus: "signed", contact: {}, notes: null, publishedAt: null, archivedAt: null, createdAt: now, updatedAt: now};

describe("rendered partner admin pages", () => {
  beforeEach(() => { state.messages = {en: {...en.Admin.partners, ...en.Admin.landingPartners} as unknown as Record<string, string>, "zh-HK": {...zh.Admin.partners, ...zh.Admin.landingPartners} as unknown as Record<string, string>}; state.forms = []; state.lifecycle = []; state.partnerList.mockReset().mockResolvedValue([]); state.partnerGet.mockReset().mockResolvedValue(partner); state.landingList.mockReset().mockResolvedValue([]); state.landingGet.mockReset().mockResolvedValue(landing); state.mediaList.mockReset().mockResolvedValue([]); for (const mock of [state.createPartner, state.updatePartner, state.publishPartner, state.archivePartner, state.createLanding, state.updateLanding, state.publishLanding, state.archiveLanding]) mock.mockReset().mockResolvedValue({status: "success"}); });

  it.each([["partner", PartnersPage, state.createPartner, "/zh-HK/admin/partners"], ["landing", LandingPage, state.createLanding, "/zh-HK/admin/landing-partners"]] as const)("renders and binds the %s create page", async (_name, Page, actionMock, path) => { render(await Page({params: Promise.resolve({locale: "zh-HK"})})); const action = state.forms[0].action as (previous: unknown, data: FormData) => Promise<unknown>; const data = new FormData(); await action({}, data); expect(actionMock).toHaveBeenCalledWith(path, expect.objectContaining({successMessage: expect.any(String), validationMessage: expect.any(String), errorMessage: expect.any(String)}), {}, data); });

  it.each([["partner", PartnerDetailPage, state.updatePartner, state.publishPartner, state.archivePartner, "/en/admin/partners/"], ["landing", LandingDetailPage, state.updateLanding, state.publishLanding, state.archiveLanding, "/en/admin/landing-partners/"]] as const)("renders and binds the %s detail page", async (_name, Page, update, publish, archive, prefix) => { render(await Page({params: Promise.resolve({locale: "en", id})})); expect(screen.getByRole("heading")).toBeInTheDocument(); const data = new FormData(); await (state.forms[0].action as (previous: unknown, data: FormData) => Promise<unknown>)({}, data); await (state.lifecycle[0].publishAction as (previous: unknown, data: FormData) => Promise<unknown>)({}, data); await (state.lifecycle[0].archiveAction as (previous: unknown, data: FormData) => Promise<unknown>)({}, data); const path = `${prefix}${id}`; expect(update).toHaveBeenCalledWith(id, path, expect.any(Object), {}, data); expect(publish).toHaveBeenCalledWith(id, path, true, {}, data); expect(archive).toHaveBeenCalledWith(id, path, true, {}, data); });
});
