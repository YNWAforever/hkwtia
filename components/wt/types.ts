export type WtAction = Readonly<{
  href: string;
  label: string;
  /**
   * Render a plain anchor. Use this when `href` is already a `localizedPath`
   * result: the locale Link would prefix `/zh` a second time.
   */
  plain?: boolean;
}>;

export type WtCard = Readonly<{title: string; copy: string; marker?: string}>;

export type WtServiceCard = WtCard & Readonly<{href?: string}>;

export type WtStep = Readonly<{title: string; copy: string}>;
