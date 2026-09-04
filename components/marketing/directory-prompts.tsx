import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type DirectoryPrompt = Readonly<{query: string; label: string}>;

// Each preset is its own one-field GET form rather than a shared submit-button/name pair on the
// existing filter form: a shared form would submit two `q` entries (the typed search value and
// the preset), and which one `parseShowcaseFilters` keeps first would depend on DOM order rather
// than intent. Same param name, same target route, same GET semantics as the real filter form --
// just not the same DOM node. `className="contents"` removes the form's own box from the grid
// layout so the real `<button>` becomes the `.directory-prompts` grid item the donor CSS expects.
export function DirectoryPrompts({locale, prompts}: Readonly<{locale: AppLocale; prompts: readonly DirectoryPrompt[]}>) {
  const action = localizedPath(locale, "/showcase");
  return <div className="directory-prompts">
    {prompts.map((prompt) => (
      <form action={action} className="contents" key={prompt.query} method="get">
        <input name="q" type="hidden" value={prompt.query} />
        <button type="submit">{prompt.label}</button>
      </form>
    ))}
  </div>;
}
