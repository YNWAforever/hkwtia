export type JourneyName = "onboarding_90d" | "renewal" | "dunning" | "winback";
export type MessageClassification = "transactional" | "marketing";
export type JourneyChannel = "email" | "whatsapp";
export type StepCondition = "always" | "no_login" | "has_login" | "profile_below_70" | "score_below_20";

export type JourneyStep = Readonly<{
  key: string;
  offsetDays: number;
  template: string;
  classification: MessageClassification;
  channels: readonly JourneyChannel[];
  condition: StepCondition;
}>;

export type JourneyContext = Readonly<{
  hasLoggedIn: boolean;
  profileCompleteness: number;
  marketingConsent: boolean;
  emailSuppressed: boolean;
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
  engagementScore: number | null;
}>;

export type ScheduleJourneyInput = Readonly<{
  journey: JourneyName;
  profileId: string;
  membershipId: string;
  instanceKey: string;
  anchor: Date;
}>;

export type ScheduledJourneyStep = Readonly<{
  journey: JourneyName;
  profileId: string;
  membershipId: string;
  instanceKey: string;
  step: string;
  template: string;
  classification: MessageClassification;
  channels: readonly JourneyChannel[];
  scheduledAt: Date;
  deliveryKey: string;
}>;

export type StepDecision = "send" | "skip_condition" | "skip_suppressed";

export type RetryDecision =
  | Readonly<{action: "retry"; code: "retryable_network" | "retryable_rate_limit" | "retryable_server"; delayMinutes: 5 | 25}>
  | Readonly<{action: "permanent"; code: "attempts_exhausted" | "provider_client_error" | "provider_unclassified_failure"}>;
