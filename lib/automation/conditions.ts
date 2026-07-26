import type {JourneyContext, JourneyStep, StepDecision} from "@/lib/automation/types";

const conditionMatches = (condition: JourneyStep["condition"], context: JourneyContext): boolean => {
  switch (condition) {
    case "always":
      return true;
    case "no_login":
      return !context.hasLoggedIn;
    case "has_login":
      return context.hasLoggedIn;
    case "profile_below_70":
      return context.profileCompleteness < 70;
    case "score_below_20":
      return context.engagementScore !== null && context.engagementScore < 20;
  }
};

const hasDeliverableChannel = (step: JourneyStep, context: JourneyContext): boolean => {
  if (step.classification === "marketing" && !context.marketingConsent) return false;

  const emailAllowed = step.channels.includes("email")
    && (step.classification === "transactional" || !context.emailSuppressed);
  const whatsappAllowed = step.channels.includes("whatsapp") && context.whatsappOptIn && Boolean(context.whatsappNumber?.trim());
  return emailAllowed || whatsappAllowed;
};

export const evaluateStep = (step: JourneyStep, context: JourneyContext): StepDecision => {
  if (!conditionMatches(step.condition, context)) return "skip_condition";
  return hasDeliverableChannel(step, context) ? "send" : "skip_suppressed";
};

/** D90 always delivers its transactional email; low engagement separately creates a staff task. */
export const shouldCreateStaffTask = (stepKey: string, context: JourneyContext): boolean =>
  stepKey === "day90_review" && context.engagementScore !== null && context.engagementScore < 20;
