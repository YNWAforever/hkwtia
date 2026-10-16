import type {ReactNode} from "react";

export type InternalAppShellProps = Readonly<{
  navigation: ReactNode;
  skipLabel: string;
  children: ReactNode;
}>;

/**
 * The one shared frame for every authenticated/transactional surface (Join, Portal, Admin).
 * Owns the skip link and the sole main#main-content landmark so no consuming layout needs its
 * own <main> -- two <main> elements on one page is an accessibility-contract violation this
 * primitive exists specifically to make structurally impossible.
 */
export function InternalAppShell({navigation, skipLabel, children}: InternalAppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {skipLabel}
      </a>
      {navigation}
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
