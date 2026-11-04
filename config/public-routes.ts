export const publicRoutes = [
  '/',
  '/join',
  '/about',
  '/about/chairman',
  '/about/committees',
  '/about/history',
  '/membership',
  '/showcase',
  // The page 404s and is omitted from the sitemap, nav, and footer. It stays in
  // this list so the site_announcements href check does not need a migration.
  '/launchpad',
  // The page 404s and is omitted from the sitemap. It stays in this list so the
  // site_announcements href check does not need a migration. A8.
  '/ai-ops',
  '/events',
  '/news',
  '/programs/cpai',
  '/programs/hkict',
  '/programs/tct',
  '/programs/asa',
  '/programmes',
  '/contact',
  '/partners',
  '/privacy',
  '/refund-policy',
  '/ai-transparency',
  '/members'
] as const;

export type PublicRoute = (typeof publicRoutes)[number];
