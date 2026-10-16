import {StatusLabel} from "@/components/wt/status-label";

export function PricingNote({label, copy}: Readonly<{label: string; copy: string}>) {
  return <div className="pricing-note">
    <StatusLabel>{label}</StatusLabel>
    <p>{copy}</p>
  </div>;
}
