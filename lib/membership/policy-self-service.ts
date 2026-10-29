import "server-only";
/**
 * Public reply aim Willy confirmed: within 5 working days.
 * This is not a committee gate. Standard joins pay first.
 * A manual exception, if one remains, is reviewed by Willy alone.
 */
export const membershipSelfServicePolicy = {
  version: "self-service-links-v1",
  membershipRefund: "unknown",
  reviewSla: "5-working-days",
  links: {
    billing: {href: "/portal/billing", labelKey: "selfService.billing"},
    support: {href: "/contact", labelKey: "selfService.support"},
  },
} as const;
