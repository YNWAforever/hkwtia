export const publicRoutes = [
  '/',
  '/about',
  '/about/chairman',
  '/about/committees',
  '/membership',
  '/showcase',
  '/launchpad',
  '/ai-ops',
  '/events',
  '/news',
  '/programs/cpai',
  '/programs/hkict',
  '/programs/tct',
  '/programs/asa',
  '/contact',
  '/privacy',
  '/ai-transparency'
] as const;

export type PublicRoute = (typeof publicRoutes)[number];
