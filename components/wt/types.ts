export type WtAction = Readonly<{href: string; label: string}>;

export type WtCard = Readonly<{title: string; copy: string; marker?: string}>;

export type WtServiceCard = WtCard & Readonly<{href?: string}>;

export type WtStep = Readonly<{title: string; copy: string}>;
