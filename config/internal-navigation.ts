export type InternalNavLinkConfig = Readonly<{id: string; href: string}>;
export type InternalNavGroupConfig = Readonly<{id: string; links: readonly InternalNavLinkConfig[]}>;

export const portalNavigationGroups: readonly InternalNavGroupConfig[] = [
  {
    id: "primary",
    links: [
      {id: "dashboard", href: "/portal"},
      {id: "profile", href: "/portal/profile"},
      {id: "company", href: "/portal/company"},
      {id: "showcase-listing", href: "/portal/company/listing"},
      {id: "directory", href: "/portal/directory"},
      {id: "events", href: "/portal/events"},
      {id: "documents", href: "/portal/documents"},
      {id: "billing", href: "/portal/billing"},
    ],
  },
];

export const adminNavigationGroups: readonly InternalNavGroupConfig[] = [
  {
    id: "workspace",
    links: [
      {id: "dashboard", href: "/admin"},
      {id: "members", href: "/admin/members"},
      {id: "at-risk", href: "/admin/at-risk"},
      {id: "segments", href: "/admin/segments"},
    ],
  },
  {
    id: "content",
    links: [
      {id: "announcements", href: "/admin/announcements"},
      {id: "news", href: "/admin/news"},
      {id: "page-copy", href: "/admin/page-copy"},
      {id: "media", href: "/admin/media"},
      {id: "partners", href: "/admin/partners"},
      {id: "landing-partners", href: "/admin/landing-partners"},
    ],
  },
  {
    id: "operations",
    links: [
      {id: "events", href: "/admin/events-mgmt"},
      {id: "listings", href: "/admin/listings-review"},
      {id: "cohorts", href: "/admin/cohorts"},
      {id: "approvals", href: "/admin/approvals"},
      {id: "reports", href: "/admin/reports"},
      {id: "automations", href: "/admin/automations"},
    ],
  },
];
