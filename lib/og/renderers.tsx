import type {CSSProperties, ReactElement} from "react";

import type {OgProps, OgRendererName} from "@/lib/og/resolve-renderer";
import {WTIA_WORDMARK_DATA_URL} from "@/lib/og/wordmark";

// Catherine Option A. Satori has no CSS variables, so the navy field and the
// official-blue accent are literals. The sand rule and the old #1b4f7a field are gone.
const NAVY = "#0F4C81";
const ACCENT = "#6686BD";
const WHITE = "#ffffff";

const FRAME = {width: 1200, height: 630, display: "flex" as const};
// Data URL, not a site path. Satori fetches src over HTTP, and Preview SSO blocks that fetch.
const LOGO_SRC = WTIA_WORDMARK_DATA_URL;
const LOGO_RATIO = 250.875 / 780.125;
const DOMAIN = "hkwtia.org";

const LEGAL = {
  en: "Hong Kong Wireless Technology Industry Association",
  "zh-HK": "香港無線科技商會",
} as const;

export type OgCardElement = ReactElement<{style: CSSProperties}>;

function logoBox(width: number, top: number, left: number, src: string) {
  const height = Math.round(width * LOGO_RATIO);
  return (
    <div style={{display: "flex", position: "absolute", top, left, width, height}}>
      <img alt="" height={height} src={src} style={{objectFit: "contain"}} width={width} />
    </div>
  );
}

function accent() {
  return <div style={{display: "flex", position: "absolute", top: 0, left: 0, width: 24, height: 630, backgroundColor: ACCENT}} />;
}

function usesChinese(props: OgProps): boolean {
  if (props.locale === "zh-HK") return true;
  if (props.locale === "en") return false;
  return /[\u3400-\u9fff]/.test(props.title);
}

function titleSize(title: string, chinese: boolean): number {
  const [large, medium, small] = chinese ? [60, 50, 42] : [64, 52, 44];
  if (title.length <= 24) return large;
  if (title.length <= 52) return medium;
  return small;
}

function isBrandOnly(title: string): boolean {
  const value = title.trim();
  return value === "WTIA" || value === LEGAL.en || value === LEGAL["zh-HK"];
}

/** Centred wordmark and both legal names. Used when a page has no headline of its own. */
function defaultCard(logoUrl: string): OgCardElement {
  const width = 390;
  const height = Math.round(width * LOGO_RATIO);
  return (
    <div style={{...FRAME, position: "relative", backgroundColor: NAVY, color: WHITE}}>
      {accent()}
      {logoBox(width, 148, Math.round((1200 - width) / 2), logoUrl)}
      <div style={{display: "flex", position: "absolute", top: 148 + height + 28, left: 60, width: 1080, flexDirection: "column", alignItems: "center", color: WHITE, fontFamily: "Noto Sans TC", fontSize: 30, fontWeight: 700, textAlign: "center"}}>
        <div style={{display: "flex"}}>{LEGAL.en}</div>
        <div style={{display: "flex", marginTop: 8}}>{LEGAL["zh-HK"]}</div>
      </div>
    </div>
  );
}

/** Headline card. No photograph and no member mark: the white WTIA wordmark only. */
function titleCard(props: OgProps, logoUrl: string): OgCardElement {
  const chinese = usesChinese(props);
  const size = titleSize(props.title, chinese);
  const legal = chinese ? LEGAL["zh-HK"] : LEGAL.en;
  return (
    <div style={{...FRAME, position: "relative", backgroundColor: NAVY, color: WHITE}}>
      {accent()}
      {logoBox(270, 90, 96, logoUrl)}
      <div style={{display: "flex", position: "absolute", top: 270, left: 96, color: WHITE, fontFamily: "Noto Sans TC", fontSize: 24, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase"}}>
        {props.eyebrow}
      </div>
      <div style={{display: "flex", position: "absolute", top: 312, left: 96, width: 1044, height: Math.round(size * 1.08 * 3), overflow: "hidden", color: WHITE, fontFamily: "Noto Sans TC", fontSize: size, fontWeight: 700, lineHeight: 1.08}}>
        {props.title}
      </div>
      <div style={{display: "flex", position: "absolute", bottom: 40, left: 96, width: 1044, justifyContent: "space-between", color: WHITE, fontFamily: "Noto Sans TC", fontSize: 24, fontWeight: 700}}>
        <div style={{display: "flex"}}>{legal}</div>
        <div style={{display: "flex"}}>{DOMAIN}</div>
      </div>
    </div>
  );
}

export function renderOgCard(renderer: OgRendererName, props: OgProps): OgCardElement {
  const logoUrl = props.logoUrl ?? LOGO_SRC;
  // Photo and member-logo treatments are retired. Option A is navy type only.
  if (renderer === "editorial" && isBrandOnly(props.title)) return defaultCard(logoUrl);
  return titleCard(props, logoUrl);
}
