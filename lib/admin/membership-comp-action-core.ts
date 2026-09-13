import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

export type CompMembershipActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
}>;

const formSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  planCode: z.enum(MEMBERSHIP_PLAN_CODES),
}).strict();

type CompMembershipOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (input: z.output<typeof formSchema>) => Promise<unknown>;
}>;

export async function runCompMembershipAction(
  _state: CompMembershipActionState,
  formData: FormData,
  options: CompMembershipOptions,
): Promise<CompMembershipActionState> {
  const parsed = formSchema.safeParse({
    profileId: formData.get("profileId"),
    planCode: formData.get("planCode"),
  });
  if (!parsed.success) return {status: "error", message: options.validationMessage};
  try {
    await options.mutate(parsed.data);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    // A denial is the caller's to translate into notFound(); swallowing it here
    // would render the admin surface to someone who may not see it exists.
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}
