import type {WtCard} from "@/components/wt/types";

export function MembershipDimensions({items}: Readonly<{items: readonly WtCard[]}>) {
  return <div className="membership-dimensions">
    {items.map((item) => (
      <article key={item.title}>
        <span>{item.marker ?? ""}</span>
        <h3>{item.title}</h3>
        <p>{item.copy}</p>
      </article>
    ))}
  </div>;
}
