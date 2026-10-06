import {programSchema, type ProgramRecord} from '@/content/schemas';

// No share image is named: all four pointed at /images/projects-hero.jpg, a generated stage
// scene whose signage reads as gibberish, so every shared programme link previewed an event
// WTIA never held. Without one, lib/metadata.ts generates a card titled with the programme.
export const programs: ProgramRecord[] = programSchema.array().parse([
  {id: 'cpai', namespace: 'programs.cpai'},
  {id: 'hkict', namespace: 'programs.hkict'},
  {id: 'tct', namespace: 'programs.tct'},
  {id: 'asa', namespace: 'programs.asa'}
]);
