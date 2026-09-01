import Image from "next/image";

export type InstitutionalPageIntroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  image?: string;
  imageAlt?: string;
}>;

const editorialImageBase = new URL("https://editorial-image.invalid/");
const rawWhitespaceOrControl = /[\s\u0000-\u001f\u007f]/u;

function ownOriginImageRequired(): never {
  throw new Error("OWN_ORIGIN_IMAGE_REQUIRED");
}

function decodeValidatedEditorialImageLayer(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    rawWhitespaceOrControl.test(value)
  ) {
    return ownOriginImageRequired();
  }

  let decoded: string;
  let parsed: URL;
  try {
    decoded = decodeURIComponent(value);
    parsed = new URL(value, editorialImageBase);
  } catch {
    return ownOriginImageRequired();
  }

  if (
    parsed.origin !== editorialImageBase.origin ||
    parsed.pathname === "/"
  ) {
    return ownOriginImageRequired();
  }

  return decoded;
}

export function assertOwnOriginEditorialImage(value: string) {
  let currentLayer = value;
  // Every non-stable percent decoding shortens the string, so this input-sized
  // budget is a deterministic upper bound rather than an arbitrary pass count.
  let remainingLayers = Math.floor(value.length / 2) + 1;

  while (remainingLayers > 0) {
    const decodedLayer = decodeValidatedEditorialImageLayer(currentLayer);
    if (decodedLayer === currentLayer) return value;
    if (decodedLayer.length >= currentLayer.length) return ownOriginImageRequired();
    currentLayer = decodedLayer;
    remainingLayers -= 1;
  }

  return ownOriginImageRequired();
}

export function InstitutionalPageIntro({eyebrow, title, lead, image, imageAlt = ""}: InstitutionalPageIntroProps) {
  const imageSource = image === undefined ? null : assertOwnOriginEditorialImage(image);

  return (
    <section className="overflow-hidden bg-background py-16 sm:py-24">
      <div className="container mx-auto grid items-center gap-10 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-shell-blue">{eyebrow}</p>
          <h1 className="editorial-serif mt-4 text-4xl font-semibold leading-tight tracking-tight text-shell-ink sm:text-6xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{lead}</p>
        </div>
        {imageSource ? (
          <Image
            alt={imageAlt}
            className="h-auto w-full rounded-shell-lg object-cover"
            height={960}
            sizes="(min-width: 1024px) 50vw, 100vw"
            src={imageSource}
            width={1280}
          />
        ) : null}
      </div>
    </section>
  );
}
