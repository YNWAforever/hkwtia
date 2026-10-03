import Link from "next/link";
import type {ComponentProps} from "react";

/** Private reads wait for intentional navigation, including viewport and hover. */
export function PrivateLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />;
}
