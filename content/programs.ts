import {programSchema, type ProgramRecord} from '@/content/schemas';

export const programs: ProgramRecord[] = programSchema.array().parse([
  {id: 'cpai', namespace: 'programs.cpai', image: '/images/projects-hero.jpg'},
  {id: 'hkict', namespace: 'programs.hkict', image: '/images/projects-hero.jpg'},
  {id: 'tct', namespace: 'programs.tct', image: '/images/projects-hero.jpg'},
  {id: 'asa', namespace: 'programs.asa', image: '/images/projects-hero.jpg'}
]);
