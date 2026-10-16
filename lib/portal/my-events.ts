import "server-only";
import {z} from "zod";
import {listOwnRegistrationHistory, readOwnRegistrationStatuses, type RegistrationHistoryInput} from "@/lib/db/repos/portal-registrations";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export async function getMyRegistrations(actor: Actor, input: RegistrationHistoryInput = {}, locale: AppLocale = "en", read = listOwnRegistrationHistory) {
  requireMember(actor);
  const page = await read(actor, input);
  return {...page, items: page.items.map((row) => ({
    id: row.id, eventId: row.eventId, source: row.source, status: row.status,
    title: locale === "zh-HK" && row.titleZh ? row.titleZh : row.titleEn, startsAt: row.startsAt,
    eventCancelled: row.eventStatus === "cancelled",
    href: row.source === "ticket" ? localizedPath(locale, `/portal/orders/${row.id}`)
      : row.eventStatus === "published" && ["public", "members_only"].includes(row.visibility) ? localizedPath(locale, `/portal/events/${row.eventId}`) : null,
  }))};
}

export async function getMyRegistrationStatuses(actor: Actor, eventIds: readonly string[], read = readOwnRegistrationStatuses) {
  requireMember(actor);
  const ids = [...new Set(eventIds)].filter((id) => z.string().uuid().safeParse(id).success);
  const statuses: Record<string, Awaited<ReturnType<typeof read>>[number]["status"]> = {};
  for (let offset = 0; offset < ids.length; offset += 50) {
    const rows = await read(actor, ids.slice(offset, offset + 50));
    for (const row of rows) statuses[row.eventId] = row.status;
  }
  return statuses;
}
