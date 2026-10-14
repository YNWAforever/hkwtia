export const seatActionErrorKeys = ["invalidInput", "forbidden", "seatLimitReached", "lastOwner", "rolePolicy", "notFound", "alreadyPending", "alreadyMember", "deliveryUncertain", "generic"] as const;
export type SeatActionErrorKey = typeof seatActionErrorKeys[number];
export type SeatActionState = Readonly<{status: "idle" | "success"}> | Readonly<{status: "error"; code: SeatActionErrorKey}>;
export type SeatAction = (previous: SeatActionState, form: FormData) => Promise<SeatActionState>;
export type SeatFeedbackLabels = Readonly<{pending: string; success: string; errors: Record<SeatActionErrorKey, string>}>;
