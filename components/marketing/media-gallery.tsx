import Image from "next/image";

import {assertOwnOriginEditorialImage} from "@/components/marketing/institutional-page-intro";

export type MediaGalleryProps = Readonly<{
  images: readonly Readonly<{src: string; alt: string}>[];
}>;

export function MediaGallery({images}: MediaGalleryProps) {
  const validatedImages = images.map((image) => ({
    ...image,
    src: assertOwnOriginEditorialImage(image.src),
  }));

  if (validatedImages.length === 0) return null;

  return (
    <ul className="grid gap-6 md:grid-cols-2">
      {validatedImages.map((image, index) => (
        // src is not unique: the commemorative-book gallery lists one file twice (C6 L924).
        <li className="overflow-hidden rounded-shell-lg bg-muted" key={`${image.src}-${index}`}>
          <Image
            alt={image.alt}
            className="h-auto w-full object-cover"
            height={640}
            loading="lazy"
            sizes="(min-width: 768px) 50vw, 100vw"
            src={image.src}
            width={960}
          />
        </li>
      ))}
    </ul>
  );
}
