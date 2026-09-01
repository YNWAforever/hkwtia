export const CONCIERGE_OPEN_EVENT = "hkwtia:concierge-open";

export function openConcierge(): void {
  window.dispatchEvent(new Event(CONCIERGE_OPEN_EVENT));
}
