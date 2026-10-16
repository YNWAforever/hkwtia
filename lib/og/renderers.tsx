import type {CSSProperties, ReactElement} from "react";

import type {OgProps, OgRendererName} from "@/lib/og/resolve-renderer";

// The site's palette, resolved to literals: Satori has no CSS variables.
const BLUE = "#1b4f7a";
const SAND = "#e8cf9a";
const LIGHT = "#f5f5f5";

const FRAME = {width: 1200, height: 630, display: "flex" as const};

// Every card's root is a 1200x630 div carrying `style`. Naming that in the return type
// keeps the size a checkable part of the contract instead of `unknown` props.
export type OgCardElement = ReactElement<{style: CSSProperties}>;

/**
 * The three share-card treatments.
 *
 * Presentation only -- which one an entity gets is `resolveOgRenderer`'s decision, and
 * keeping that split is what makes the choice testable at all, since these return trees
 * Satori turns into opaque PNG bytes.
 *
 * Note on type: no font bytes are passed to `ImageResponse`, so Satori ignores these
 * `fontFamily` hints and draws with its own default face. The site's serif is a CSS
 * variable over a system stack (`app/globals.css`), which Satori cannot consume.
 */
export function renderOgCard(renderer: OgRendererName, props: OgProps): OgCardElement {
  if (renderer === "photo") return photoCard(props);
  if (renderer === "logo") return logoCard(props);
  return editorialCard(props);
}

function editorialCard({title, eyebrow}: OgProps): OgCardElement {
  return (
    <div style={{...FRAME, flexDirection: "column", justifyContent: "space-between", backgroundColor: BLUE, padding: 72, color: "#ffffff"}}>
      <div style={{display: "flex", fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: SAND}}>{eyebrow}</div>
      <div style={{display: "flex", flexDirection: "column"}}>
        <div style={{display: "flex", width: 110, height: 4, backgroundColor: SAND, marginBottom: 28}} />
        <div style={{display: "flex", fontFamily: "serif", fontSize: 68, lineHeight: 1.15}}>{title}</div>
      </div>
      <div style={{display: "flex", fontSize: 24, letterSpacing: 3, opacity: 0.75}}>WISETECH HONG KONG</div>
    </div>
  );
}

function logoCard({title, eyebrow, imageUrl}: OgProps): OgCardElement {
  // Light ground, contained, undarkened. A member's mark is not a backdrop.
  return (
    <div style={{...FRAME, flexDirection: "column", backgroundColor: LIGHT}}>
      <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: 80}}>
        {imageUrl ? <img src={imageUrl} width={520} height={260} style={{objectFit: "contain"}} alt="" /> : <div style={{display: "flex"}} />}
      </div>
      <div style={{display: "flex", flexDirection: "column", backgroundColor: BLUE, padding: "36px 72px", color: "#ffffff"}}>
        <div style={{display: "flex", fontSize: 24, letterSpacing: 6, textTransform: "uppercase", color: SAND}}>{eyebrow}</div>
        <div style={{display: "flex", fontFamily: "serif", fontSize: 52, marginTop: 10}}>{title}</div>
      </div>
    </div>
  );
}

function photoCard({title, eyebrow, imageUrl}: OgProps): OgCardElement {
  return (
    <div style={{...FRAME, position: "relative"}}>
      {imageUrl ? <img src={imageUrl} width={1200} height={630} style={{objectFit: "cover"}} alt="" /> : <div style={{display: "flex", width: 1200, height: 630, backgroundColor: BLUE}} />}
      <div style={{display: "flex", position: "absolute", top: 0, left: 0, width: 1200, height: 630, background: "linear-gradient(to top, rgba(27,79,122,0.96) 22%, rgba(27,79,122,0.25) 100%)"}} />
      <div style={{display: "flex", position: "absolute", bottom: 0, left: 0, flexDirection: "column", padding: 72, color: "#ffffff"}}>
        <div style={{display: "flex", fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: SAND, marginBottom: 14}}>{eyebrow}</div>
        <div style={{display: "flex", fontFamily: "serif", fontSize: 62, lineHeight: 1.15}}>{title}</div>
      </div>
    </div>
  );
}
