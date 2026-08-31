export type PublicEventStatus = "open" | "past";

export type PublicEventProjection = Readonly<{
  id: string;
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  capacity: number | null;
  hero: Readonly<{url: string; alt: string}> | null;
}>;

export function parsePublicEventStatus(value: string | readonly string[] | undefined): PublicEventStatus {
  return value === "past" ? "past" : "open";
}

export function eventBoundary(event: Readonly<{startsAt: Date; endsAt: Date | null}>): Date {
  return event.endsAt ?? event.startsAt;
}
