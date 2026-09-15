import "server-only";

import QRCode from "qrcode";

/**
 * The QR as an SVG string. SVG rather than PNG because there is no image
 * pipeline in this project and none is needed: it is text, so it inlines into
 * the page and stays crisp at any size.
 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {type: "svg", errorCorrectionLevel: "M", margin: 1});
}
