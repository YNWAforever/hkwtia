import "server-only";
/** Existing shipped copy only; this contract grants no membership terms. */
export const membershipSelfServicePolicy = {
  version: "self-service-links-v1",
  membershipRefund: "unknown",
  reviewSla: "unknown",
  links: {
    billing: {href: "/portal/billing", labelKey: "selfService.billing"},
    support: {href: "/contact", labelKey: "selfService.support"},
  },
} as const;
