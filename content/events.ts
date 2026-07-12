import {eventSchema, type EventRecord} from '@/content/schemas';

export const events: EventRecord[] = eventSchema.array().parse([]);
