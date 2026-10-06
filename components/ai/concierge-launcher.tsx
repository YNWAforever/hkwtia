"use client";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

/** Shared fixed anchor keeps the public CSS offsets and portal fallback identical. */
export function ConciergeLauncher({
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="concierge fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40">
      {children}
    </div>
  );
}
const LauncherButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & { label: string }
>(function LauncherButton({ label, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      aria-label={label}
      className="concierge-trigger touch-manipulation inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg motion-safe:transition-[opacity,transform] motion-safe:duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-90"
    >
      <span
        aria-hidden="true"
        className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white font-serif text-[15px] font-bold text-primary"
      >
        W+
      </span>
      {/* Wrapped so a phone can collapse the pill to its mark (wisetech-experience.css);
          the accessible name stays on aria-label either way. */}
      <span className="concierge-trigger-label">{label}</span>
    </button>
  );
});
ConciergeLauncher.Button = LauncherButton;
