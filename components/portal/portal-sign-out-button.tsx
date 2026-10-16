"use client";

import {clearInboxDraftStorage} from "@/lib/admin/inbox-draft-storage";
import {useState} from "react";

import {useRouter} from "@/i18n/navigation";

/** Imported on demand, like the Google button: the auth client is ~400KB of decoded script that
 *  every portal and admin page shipped just to render this button (round 20). */
const loadAuthClient = () => import("@/lib/auth/client").then((module) => module.authClient);

export function PortalSignOutButton({label, errorLabel, destination = "/member-login", beforeSignOut}: Readonly<{label: string; errorLabel: string; destination?: "/member-login" | "/admin-login"; beforeSignOut?: () => boolean}>) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onFocus={() => void loadAuthClient()}
        onPointerEnter={() => void loadAuthClient()}
        onClick={async () => {
          if (beforeSignOut && !beforeSignOut()) return;
          setPending(true);
          setFailed(false);
          try {
            const authClient = await loadAuthClient();
            const result = await authClient.signOut();
            if (result.error) throw new Error("SIGN_OUT_FAILED");
            clearInboxDraftStorage();
            router.push(destination);
            router.refresh();
          } catch {
            setFailed(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {label}
      </button>
      {failed ? <p role="alert" className="mt-1 text-sm text-destructive">{errorLabel}</p> : null}
    </div>
  );
}
