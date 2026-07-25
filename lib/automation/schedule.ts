import {JOURNEYS} from "@/config/journeys";
import {addHongKongDays} from "@/lib/automation/hong-kong-time";
import type {ScheduleJourneyInput, ScheduledJourneyStep} from "@/lib/automation/types";

export const scheduleJourney = (input: ScheduleJourneyInput): readonly ScheduledJourneyStep[] =>
  JOURNEYS[input.journey].map((journeyStep) => ({
    journey: input.journey,
    profileId: input.profileId,
    membershipId: input.membershipId,
    instanceKey: input.instanceKey,
    step: journeyStep.key,
    template: journeyStep.template,
    classification: journeyStep.classification,
    channels: journeyStep.channels,
    scheduledAt: addHongKongDays(input.anchor, journeyStep.offsetDays),
    deliveryKey: `journey:${input.profileId}:${input.journey}:${input.instanceKey}:${journeyStep.key}`,
  }));
