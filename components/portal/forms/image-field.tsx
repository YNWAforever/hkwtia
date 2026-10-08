"use client";

import Image from "next/image";
import {useId, useState} from "react";

import {HeroUpload, type HeroUploadLabels} from "@/components/portal/hero-upload";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";

/** `help` is optional: only the listing logo needs to say where its upload ends up. */
export type PortalImageFieldLabels = Readonly<{label: string; help?: string; empty: string; previewAlt: string; external: string; remove: string; upload: HeroUploadLabels}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_PREFIX = "/api/media/";

/** A path on this site (`/images/showcase/logo.svg`), as opposed to a link to someone else's. */
function isSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

/** The media id behind a stored value, or null when it is empty or an external link. */
function mediaId(value: string, store: "id" | "path"): string | null {
  if (store === "id") return UUID.test(value) ? value : null;
  return value.startsWith(MEDIA_PREFIX) && UUID.test(value.slice(MEDIA_PREFIX.length)) ? value.slice(MEDIA_PREFIX.length) : null;
}

/**
 * The company logo / listing logo control. The form still submits the original field name
 * (`logoMediaId` or `logoReference`) through a hidden input, but the member sees a preview and an
 * upload control instead of an internal id. An external https reference is shown as text and never
 * as an `img`: the media route only serves our own uploads, and the page must not hotlink a
 * third-party URL. A failed upload leaves the value untouched (HeroUpload reports its own status).
 * A stored site path that is not one of our uploads (a seeded `/images/...` logo) is also shown as
 * text, but labelled "Current logo": "Linked image" told the member it pointed off-site.
 */
export function PortalImageField({name, initialValue, store, readOnly, labels}: Readonly<{name: "logoMediaId" | "logoReference"; initialValue: string; store: "id" | "path"; readOnly: boolean; labels: PortalImageFieldLabels}>) {
  const [value, setValue] = useState(initialValue);
  const id = mediaId(value, store);
  const labelId = useId();
  const helpId = useId();

  return (
    <div aria-describedby={labels.help ? helpId : undefined} aria-labelledby={labelId} className="portal-field portal-image-field" role="group">
      <span className="portal-field-label" id={labelId}>{labels.label}</span>
      {labels.help ? <p className="portal-field-help" id={helpId}>{labels.help}</p> : null}
      <input name={name} type="hidden" value={value} />
      <div className="portal-image-preview">
        {id ? (
          // unoptimized: every request must reach /api/media/[id]'s revocation and integrity checks,
          // which the optimizer's cache would skip (tests/unit/image-render-policy.test.ts).
          <Image alt={labels.previewAlt} height={72} src={`${MEDIA_PREFIX}${id}`} unoptimized={isPrivateMediaDeliveryUrl(`${MEDIA_PREFIX}${id}`)} width={72} />
        ) : value ? (
          <p className="portal-image-external"><span>{isSitePath(value) ? labels.previewAlt : labels.external}</span> <code>{value}</code></p>
        ) : (
          <p className="portal-image-empty">{labels.empty}</p>
        )}
        {!readOnly && value ? <button className="portal-image-remove" onClick={() => setValue("")} type="button">{labels.remove}</button> : null}
      </div>
      {readOnly ? null : (
        // Own hook for HeroUpload: when read-only it is not rendered, so the CSS cannot target "the last child".
        <div className="portal-image-upload">
          <HeroUpload enterUploads labels={labels.upload} onUploaded={(uploaded) => setValue(store === "id" ? uploaded : `${MEDIA_PREFIX}${uploaded}`)} />
        </div>
      )}
    </div>
  );
}
