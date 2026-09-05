"use client";

import {useState} from "react";

import {authClient} from "@/lib/auth/client";
import {useRouter} from "@/i18n/navigation";

export function PortalSignOutButton({label, errorLabel}: Readonly<{label: string; errorLabel: string}>) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            await authClient.signOut();
            router.push("/member-login");
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
