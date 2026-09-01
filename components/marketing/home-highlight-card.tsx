import Image from "next/image";

import {Link} from "@/i18n/navigation";

export type HomeHighlightCardProps = Readonly<{
  label: string;
  state: "available" | "empty" | "unavailable";
  title?: string;
  summary?: string;
  meta?: string;
  image?: Readonly<{src: string; alt: string}>;
  href: string;
  actionLabel: string;
  stateMessage?: string;
}>;

export function HomeHighlightCard({label, state, title, summary, meta, image, href, actionLabel, stateMessage}: HomeHighlightCardProps) {
  if (state === "available" && !title) throw new Error("HOME_HIGHLIGHT_TITLE_REQUIRED");
  const safeImage = image?.src.startsWith("/") && !image.src.startsWith("//") ? image : undefined;

  return (
    <article className="glass-card flex h-full flex-col p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{label}</p>
      {state === "available" ? (
        <>
          <div className="mt-4 flex items-start gap-4">
            {safeImage ? <Image alt={safeImage.alt} className="h-12 w-12 shrink-0 rounded-md object-contain" height={48} src={safeImage.src} width={48} /> : null}
            <h3 className="font-serif text-2xl font-semibold">{title}</h3>
          </div>
          {summary ? <p className="mt-4 leading-relaxed text-muted-foreground">{summary}</p> : null}
          {meta ? <p className="mt-4 text-sm font-medium text-muted-foreground">{meta}</p> : null}
        </>
      ) : <p className="mt-4 leading-relaxed text-muted-foreground">{stateMessage}</p>}
      <Link className="mt-6 inline-flex min-h-11 min-w-11 items-center justify-center self-start rounded-md border border-input px-4 py-2 font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" href={href}>{actionLabel}</Link>
    </article>
  );
}
