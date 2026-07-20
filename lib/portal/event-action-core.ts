export type RegistrationActionState = Readonly<{status?: "success" | "error"; message?: string}>;

export async function runEventRegistrationAction(
  _state: RegistrationActionState,
  formData: FormData,
  options: Readonly<{successMessage: string; errorMessage: string; mutate: (formData: FormData) => Promise<unknown>}>,
): Promise<RegistrationActionState> {
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch {
    return {status: "error", message: options.errorMessage};
  }
}
