import {
  mapEventRegistrationError,
  mapEventRegistrationResult,
  type RegistrationActionMessages,
  type RegistrationActionState,
  type RegistrationDisposition,
} from "@/lib/events/registration-state";

export async function runEventRegistrationAction(
  _state: RegistrationActionState,
  formData: FormData,
  options: Readonly<{messages: RegistrationActionMessages; mutate: (formData: FormData) => Promise<Readonly<{disposition: RegistrationDisposition}>>}>,
): Promise<RegistrationActionState> {
  try {
    const {disposition} = await options.mutate(formData);
    return mapEventRegistrationResult(disposition, options.messages);
  } catch (error) {
    return mapEventRegistrationError(error, options.messages);
  }
}
