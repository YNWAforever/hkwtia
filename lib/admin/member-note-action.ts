import "server-only";

import {z} from "zod";

import type {MemberNoteFormState} from "@/components/admin/member-note-form";
import {appendMemberNote} from "@/lib/db/repos/member-notes";
import type {AdminActor} from "@/lib/membership/lifecycle";

type Labels = Readonly<{success: string; validation: string; error: string}>;
type Dependencies = Readonly<{
  actor: () => Promise<AdminActor>;
  append: typeof appendMemberNote;
  revalidate: (path: string) => void;
}>;

export function createAppendMemberNoteAction({profileId, path, labels, dependencies}: Readonly<{profileId: string; path: string; labels: Labels; dependencies: Dependencies}>) {
  return async (_state: MemberNoteFormState, formData: FormData): Promise<MemberNoteFormState> => {
    try {
      await dependencies.append(await dependencies.actor(), {profileId, body: formData.get("body")});
      dependencies.revalidate(path);
      return {status: "success", message: labels.success};
    } catch (error) {
      if (error instanceof z.ZodError) return {status: "error", message: labels.validation};
      return {status: "error", message: labels.error};
    }
  };
}