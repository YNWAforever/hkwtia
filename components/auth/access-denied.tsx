import {Link} from "@/i18n/navigation";

export function AccessDenied({title, copy, home, portal}: Readonly<{
  title: string; copy: string; home: string; portal: string;
}>) {
  return <div className="glass-card mx-auto max-w-xl p-6 sm:p-10" role="alert">
    <h1 className="font-serif text-3xl font-semibold">{title}</h1>
    <p className="mt-3 text-muted-foreground">{copy}</p>
    <div className="mt-6 flex flex-wrap gap-4">
      <Link className="min-h-11 content-center underline" href="/portal">{portal}</Link>
      <Link className="min-h-11 content-center underline" href="/">{home}</Link>
    </div>
  </div>;
}
