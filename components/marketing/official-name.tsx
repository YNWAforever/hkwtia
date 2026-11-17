import type {ReactNode} from "react";

// 「資訊科技初創企業獎」should break after 資訊科技, never inside 企業.
// The characters come from the approved name itself so the visible line stays exact.
const ICT_STARTUP_AWARD_ZH = "資訊科技初創企業獎";
const ICT_STARTUP_AWARD_BREAK = 4;

export function OfficialName({name}: Readonly<{name: string}>): ReactNode {
  const at = name.indexOf(ICT_STARTUP_AWARD_ZH);
  if (at < 0) return name;
  const before = name.slice(0, at);
  const after = name.slice(at + ICT_STARTUP_AWARD_ZH.length);
  const head = ICT_STARTUP_AWARD_ZH.slice(0, ICT_STARTUP_AWARD_BREAK);
  const tail = ICT_STARTUP_AWARD_ZH.slice(ICT_STARTUP_AWARD_BREAK);
  return (
    <>
      {before}
      {head}
      <wbr />
      <span className="official-name-keep">{tail}</span>
      {after}
    </>
  );
}
