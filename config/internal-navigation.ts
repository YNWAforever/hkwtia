export type InternalNavLinkConfig = Readonly<{id: string; href: string}>;
export type InternalNavGroupConfig = Readonly<{id: string; links: readonly InternalNavLinkConfig[]}>;

// `as const satisfies` (rather than a plain `: readonly InternalNavGroupConfig[]` annotation)
// keeps each `id` as its literal string type instead of widening to `string`, so nav components
// can derive a literal union of real link ids and have TypeScript catch a typo'd label-key lookup.
export const portalNavigationGroups = [
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
      // Phase D-2: the member tools sit with the account's benefits, before billing.
      {id: "tools", href: "/portal/tools"},
      {id: "billing", href: "/portal/billing"},
    ],
  },
] as const satisfies readonly InternalNavGroupConfig[];

export const adminNavigationGroups = [
  {id: "workspace", links: [
    {id: "dashboard", href: "/admin"}, {id: "at-risk", href: "/admin/at-risk"},
    {id: "tasks", href: "/admin/tasks"}, {id: "reports", href: "/admin/reports"},
  ]},
  {id: "members-organizations", links: [
    {id: "members", href: "/admin/members"}, {id: "batches", href: "/admin/batches"}, {id: "contacts", href: "/admin/contacts"},
    {id: "segments", href: "/admin/segments"}, {id: "listings", href: "/admin/listings-review"},
    {id: "profiles-review", href: "/admin/profiles-review"}, {id: "cohorts", href: "/admin/cohorts"},
  ]},
  {id: "events", links: [
    {id: "events", href: "/admin/events-mgmt"}, {id: "approvals", href: "/admin/approvals"},
  ]},
  {id: "communications-follow-up", links: [
    {id: "inbox", href: "/admin/inbox"}, {id: "campaigns", href: "/admin/campaigns"},
    {id: "templates", href: "/admin/templates"}, {id: "automations", href: "/admin/automations"},
  ]},
  {id: "content-settings", links: [
    {id: "announcements", href: "/admin/announcements"}, {id: "news", href: "/admin/news"},
    {id: "page-copy", href: "/admin/page-copy"}, {id: "media", href: "/admin/media"},
    {id: "partners", href: "/admin/partners"}, {id: "landing-partners", href: "/admin/landing-partners"},
  ]},
] as const satisfies readonly InternalNavGroupConfig[];
