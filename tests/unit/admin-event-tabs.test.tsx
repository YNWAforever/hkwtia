import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("@/components/admin/event-attendee-export-button",()=>({EventAttendeeExportButton:({search}:{search:string})=><button data-export-search={search}>export preview</button>}));
const reads = vi.hoisted(() => ({
  byId: vi.fn(), all: vi.fn(), attendees: vi.fn(), attendeePage: vi.fn(), orderPage: vi.fn(), allOrders: vi.fn(), media: vi.fn(), cancel: vi.fn(), notice: vi.fn(), noticeSummary: vi.fn(), held: vi.fn(), paid: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => Object.assign((key: string) => key, {raw: (key: string) => key}),
}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: async () => ({kind: "staff", userId: "staff", profileId: "staff"})}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {
  getForAdmin: reads.byId, listForAdmin: reads.all, listAttendees: reads.attendees, listAttendeePage: reads.attendeePage, cancellationPreview: reads.cancel,
}, localizeEvent: () => ({title: "Event"})}));
vi.mock("@/lib/db/repos/event-orders", () => ({eventOrdersRepository: {listEventOrders: reads.allOrders, heldSeats: reads.held, paidSeats: reads.paid}, listEventOrderPage: reads.orderPage}));
vi.mock("@/lib/db/repos/media", () => ({mediaRepository: {listActiveForAdmin: reads.media}}));
vi.mock("@/lib/db/repos/event-notifications", () => ({eventNotificationsRepository: {preview: reads.notice, summary: reads.noticeSummary}}));
vi.mock("@/lib/admin/event-actions", () => ({updateEventAction: vi.fn(), checkInEventAttendeeAction: vi.fn(), checkInEventGuestAction: vi.fn(), cancelEventAction: vi.fn()}));
vi.mock("@/lib/tickets/check-in-actions", () => ({submitSeatCheckInAction: vi.fn()}));
vi.mock("@/lib/tickets/refund-actions", () => ({submitRefundOrderAction: vi.fn()}));
vi.mock("@/components/admin/event-form", () => ({EventForm: () => <div data-tab="content"/>}));
vi.mock("@/components/admin/cancel-event-panel", () => ({CancelEventPanel: () => <div data-panel="cancel"/>}));
vi.mock("@/components/admin/attendee-table", () => ({AttendeeTable: () => <div data-tab="attendees"/>}));
vi.mock("@/components/admin/orders-table", () => ({OrdersTable: () => <div data-tab="orders"/>}));

import AdminEventDetailPage from "@/app/[locale]/(admin)/admin/events-mgmt/[id]/page";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const event = {id, titleEn: "Event", registrationMode: "ticketed", capacity: 100, status: "published"};

beforeEach(() => {
  vi.clearAllMocks();
  reads.byId.mockResolvedValue(event);
  reads.all.mockResolvedValue([event]);
  reads.attendees.mockResolvedValue([]);
  reads.attendeePage.mockResolvedValue({items: [], nextCursor: null});
  reads.orderPage.mockResolvedValue({items: [], nextCursor: null});
  reads.allOrders.mockResolvedValue([]);
  reads.media.mockResolvedValue([]);
  reads.cancel.mockResolvedValue(null);
  reads.notice.mockResolvedValue(null);
  reads.noticeSummary.mockResolvedValue(null);
  reads.held.mockResolvedValue(0);
  reads.paid.mockResolvedValue(0);
});

async function markup(tab?: string) {
  const page = await AdminEventDetailPage({params: Promise.resolve({locale: "en", id}), searchParams: Promise.resolve(tab ? {tab} : {})} as never);
  return renderToStaticMarkup(page);
}

describe("admin event detail tabs", () => {
  it("loads one event and content dependencies without full attendee or order histories", async () => {
    expect(await markup()).toContain('data-tab="content"');
    expect(reads.byId).toHaveBeenCalledOnce();
    expect(reads.all).not.toHaveBeenCalled();
    expect(reads.attendees).not.toHaveBeenCalled();
    expect(reads.attendeePage).not.toHaveBeenCalled();
    expect(reads.allOrders).not.toHaveBeenCalled();
    expect(reads.orderPage).not.toHaveBeenCalled();
  });

  it("loads only the bounded attendee page on the attendee tab", async () => {
    expect(await markup("attendees")).toContain('data-tab="attendees"');
    expect(reads.attendeePage).toHaveBeenCalledOnce();
    expect(reads.media).not.toHaveBeenCalled();
    expect(reads.cancel).not.toHaveBeenCalled();
    expect(reads.orderPage).not.toHaveBeenCalled();
  });

  it("offers a background export of the visible search without reading the full list", async()=>{
    vi.stubEnv("ADMIN_BATCH_ENABLED","true");vi.stubEnv("EVENT_ATTENDEE_EXPORT_ENABLED","true");
    try{
      const page=await AdminEventDetailPage({params:Promise.resolve({locale:"zh-HK",id}),searchParams:Promise.resolve({tab:"attendees",q:"Synthetic"})});
      const html=renderToStaticMarkup(page);expect(html).toContain('data-export-search="Synthetic"');expect(html).not.toContain('attendees.csv');expect(reads.attendees).not.toHaveBeenCalled();
    }finally{vi.unstubAllEnvs();}
  });
  it("loads only the bounded order page on the orders tab", async () => {
    expect(await markup("orders")).toContain('data-tab="orders"');
    expect(reads.orderPage).toHaveBeenCalledOnce();
    expect(reads.attendeePage).not.toHaveBeenCalled();
    expect(reads.media).not.toHaveBeenCalled();
  });
});
