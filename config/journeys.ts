import type {JourneyChannel, JourneyName, JourneyStep, MessageClassification, StepCondition} from "@/lib/automation/types";

const step = (
  key: string,
  offsetDays: number,
  template: string,
  classification: MessageClassification,
  channels: readonly JourneyChannel[] = ["email"],
  condition: StepCondition = "always",
): JourneyStep => ({key, offsetDays, template, classification, channels, condition});

export const JOURNEYS = {
  onboarding_90d: [
    step("welcome", 0, "welcome", "transactional"),
    step("day1_video", 1, "day1_video", "marketing"),
    step("day7_nudge", 7, "day7_nudge", "transactional", ["email"], "no_login"),
    step("day7_mixer", 7, "day7_mixer", "marketing", ["email"], "has_login"),
    step("day14_profile", 14, "day14_profile", "transactional", ["email"], "profile_below_70"),
    step("day30_recap", 30, "day30_recap", "marketing"),
    step("day45_content", 45, "day45_content", "marketing"),
    step("day60_committee", 60, "day60_committee", "marketing"),
    step("day90_review", 90, "day90_review", "transactional"),
  ],
  renewal: [
    step("renewal_90", -90, "renewal_90", "transactional"),
    step("renewal_60", -60, "renewal_60", "transactional"),
    step("renewal_30", -30, "renewal_30", "transactional"),
    step("renewal_14", -14, "renewal_14", "transactional", ["email", "whatsapp"]),
  ],
  dunning: [
    step("dunning_0", 0, "dunning_0", "transactional"),
    step("dunning_3", 3, "dunning_3", "transactional", ["email", "whatsapp"]),
    step("dunning_7", 7, "dunning_7", "transactional"),
    step("lapsed", 14, "lapsed_survey", "transactional"),
  ],
  winback: [
    step("winback_7", 7, "lapsed_survey", "marketing"),
    step("winback_21", 21, "winback_21", "marketing"),
    step("winback_60", 60, "winback_60", "marketing"),
  ],
} as const satisfies Record<JourneyName, readonly JourneyStep[]>;
