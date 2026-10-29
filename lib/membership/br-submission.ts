import {BR_UPLOAD_LIMITS, BR_UPLOAD_PART_BYTES} from "@/config/membership-journey";
import type {JoinFormState} from "@/components/join/join-form";

/** Keep the 8 MB allowance without sending more than 3 MB of file bytes per action. */
export async function submitWithBrParts(
  action: (state: JoinFormState, data: FormData) => Promise<JoinFormState>,
  state: JoinFormState,
  data: FormData,
): Promise<JoinFormState> {
  const file = data.get("businessRegistration");
  if (!(file instanceof File) || file.size <= BR_UPLOAD_PART_BYTES) return action(state, data);
  if (file.size > BR_UPLOAD_LIMITS.maxBytes) {
    data.delete("businessRegistration");
    data.set("brTooLarge", "1");
    return action(state, data);
  }
  const uploadId = crypto.randomUUID();
  const partCount = Math.ceil(file.size / BR_UPLOAD_PART_BYTES);
  function submission() {
    const form = new FormData();
    for (const [key, value] of data) if (key !== "businessRegistration") form.append(key, value);
    form.set("brUploadId", uploadId);
    form.set("brPartCount", String(partCount));
    form.set("brFileName", file instanceof File ? file.name : "registration");
    return form;
  }
  for (let index = 0; index < partCount; index += 1) {
    const form = submission();
    form.set("brPartIndex", String(index));
    form.set("businessRegistration", file.slice(index * BR_UPLOAD_PART_BYTES, (index + 1) * BR_UPLOAD_PART_BYTES), "part");
    const result = await action(state, form);
    if (result.message || Object.keys(result.fieldErrors ?? {}).length) return result;
  }
  return action(state, submission());
}
