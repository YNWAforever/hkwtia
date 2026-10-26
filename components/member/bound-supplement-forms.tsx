import "server-only";
import {publishSupplement, respondToSupplement} from "@/app/actions/supplements";
import {SupplementPublishPreview} from "@/components/admin/supplement-publish-preview";
import {SupplementResponseForm, type SupplementFormProps} from "@/components/member/supplement-response-form";

type Props = Omit<SupplementFormProps, "action">;
/** Ready for authenticated page composition; intentionally unmounted until session UAT. */
export function BoundSupplementPublishPreview(props: Props) {
  return <SupplementPublishPreview {...props} action={publishSupplement}/>;
}
export function BoundSupplementResponseForm(props: Props) {
  return <SupplementResponseForm {...props} action={respondToSupplement}/>;
}
