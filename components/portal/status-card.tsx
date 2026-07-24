import type {PortalMembershipStatus} from "@/lib/portal/queries";

const statusStyles: Record<PortalMembershipStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10",
  past_due: "border-amber-500/40 bg-amber-500/10",
  cancel_at_period_end: "border-amber-500/40 bg-amber-500/10",
  pending_payment: "border-sky-500/40 bg-sky-500/10",
  pending_review: "border-violet-500/40 bg-violet-500/10",
};

export function StatusCard({status, label, title, description}: {status: PortalMembershipStatus; label: string; title: string; description: string}) {
  return (
    <section aria-live="polite" className={`rounded-xl border p-5 ${statusStyles[status]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <h2 className="mt-2 font-serif text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}
