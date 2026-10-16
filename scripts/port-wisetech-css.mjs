// Regenerates app/styles/wisetech.css from the WiseTech donor stylesheet.
//
// The port is mechanical by design: selectors stay verbatim so the output can be diffed against
// the donor, and every deviation is one of the rules below. Keeping the generator in the repo is
// the point — the plan's draft of it had already diverged from the artifact in three ways (join
// prefixes, nested :root handling, declaration-name renames), and a transform nobody can re-run
// is not evidence of anything.
//
// Usage: npm run port:wisetech
// The donor comes from this repository's object store at commit f91ecc5. Set WISETECH_DONOR_DIR
// to read <dir>/app/globals.css instead, for a checkout of the donor outside git.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import postcss from 'postcss';

const DONOR_COMMIT = 'f91ecc5';
const OUTPUT = 'app/styles/wisetech.css';

function readDonor() {
  const donorDir = process.env.WISETECH_DONOR_DIR;
  if (donorDir) return fs.readFileSync(path.join(donorDir, 'app', 'globals.css'), 'utf8');
  return execFileSync('git', ['show', `${DONOR_COMMIT}:app/globals.css`], {encoding: 'utf8'});
}

const root = postcss.parse(readDonor());

// The whole join-form family goes: the donor's six-step join form is not ported and the real
// /join flow is authoritative, so .join-options, .join-progress, .join-actions and .join-success
// are donor-only too, not just the four scaffold classes.
const dropPrefixes = ['.portal-', '.join-', '.onboarding-actions',
  '.review-list', '.site-search-form', '.search-feedback', '.sr-only'];

const renames = new Map([
  ['var(--ink-soft)', 'var(--wt-ink-soft)'], ['var(--ink)', 'var(--wt-ink)'], ['var(--paper-bright)', 'var(--wt-paper-bright)'],
  ['var(--paper)', 'var(--wt-paper)'], ['var(--stone)', 'var(--wt-stone)'], ['var(--steel)', 'var(--wt-steel)'],
  ['var(--cyan)', 'var(--wt-cyan)'], ['var(--jade)', 'var(--wt-jade)'], ['var(--amber)', 'var(--wt-amber)'],
  ['var(--blue)', 'var(--wt-blue)'], ['var(--violet)', 'var(--wt-violet)'], ['var(--line-light)', 'var(--wt-line-light)'],
  ['var(--line)', 'var(--wt-line)'], ['var(--shadow)', 'var(--wt-shadow)'], ['var(--accent-text)', 'var(--wt-accent-text)'],
  // Donor locals, not tokens: --accent is set by the .accent-* pill classes, --event-photo by
  // inline style on the event hero, --mobile-menu-pad by .mobile-menu itself. They still need the
  // prefix — an unprefixed var(--accent) would resolve against shadcn's --accent HSL triplet in
  // globals.css and render `border: 1px solid 42 79% 75%`.
  ['var(--accent)', 'var(--wt-accent)'], ['var(--event-photo)', 'var(--wt-event-photo)'],
  ['var(--mobile-menu-pad)', 'var(--wt-mobile-menu-pad)'],
  ['var(--reading-width)', 'var(--wt-reading-width)'], ['var(--heading-display)', 'var(--wt-heading-display)'],
  ['var(--heading-section)', 'var(--wt-heading-section)'], ['var(--heading-card)', 'var(--wt-heading-card)'],
  ['var(--display)', 'var(--font-serif)'], ['var(--sans)', 'var(--font-sans)'],
]);

// Rename by variable name, not by the literal `var(--x)` string: .rich-item-number uses
// `var(--accent-text,#0f4c81)`, which a literal split/join would miss and leave unprefixed.
// The same map renames declaration names, so the pill accents, the mobile menu padding and the
// media-scoped heading overrides keep naming the properties the rest of the file reads.
const nameRenames = new Map([...renames].map(([from, to]) => [from.slice(4, -1), to.slice(4, -1)]));

function isDropped(part) {
  return dropPrefixes.some((prefix) => part.trim().startsWith(prefix));
}

root.walkAtRules('import', (rule) => rule.remove());
root.walkRules((rule) => {
  const selector = rule.selector.trim();
  // Only the three top-level :root blocks are token declarations that globals.css now owns. The
  // two nested in @media(max-width:520px) are the donor's mobile heading overrides; they stay,
  // with their declaration names renamed through the same map as the references.
  if (selector === ':root') {
    if (rule.parent === root) rule.remove();
    return;
  }
  if (rule.parent === root && (selector === '*' || selector === 'html' || selector === 'body')) {
    // The donor's own `*`, `html { scroll-behavior; background }` and the first `body` rule are
    // chrome owned by globals.css. `html { scroll-padding-top }` and the readability-pass
    // `body { font-size; line-height }` are type rules and stay.
    const props = rule.nodes.map((node) => node.prop);
    if (props.includes('box-sizing') || props.includes('scroll-behavior') || props.includes('background')) {
      rule.remove();
      return;
    }
  }
  const parts = selector.split(',');
  if (parts.some(isDropped)) {
    const kept = parts.map((part) => part.trim()).filter((part) => !isDropped(part));
    if (kept.length === 0) rule.remove();
    else rule.selector = kept.join(', ');
  }
});
root.walkDecls((decl) => {
  let value = decl.value.replace(/var\((\s*)(--[a-z0-9-]+)/g, (match, space, name) => {
    const renamed = nameRenames.get(name);
    return renamed ? `var(${space}${renamed}` : match;
  });
  if (decl.prop === 'outline' && value === '3px solid #ff5c4d') value = '3px solid var(--wt-focus)';
  decl.value = value;
  const renamedProp = nameRenames.get(decl.prop);
  if (renamedProp) decl.prop = renamedProp;
});
root.walkRules((rule) => {
  if (rule.selector.trim() !== ':root') return;
  // A surviving media-scoped :root must not open a line: the port test forbids top-level token
  // blocks with /^:root/m, and an unindented nested block would trip a check aimed elsewhere.
  if (typeof rule.raws.before !== 'string' || /(^|\n)$/.test(rule.raws.before)) rule.raws.before = '\n  ';
});
root.walkAtRules('media', (media) => {
  if (media.nodes.length === 0) media.remove();
});

const keyframes = [];
root.walkAtRules('keyframes', (rule) => {
  keyframes.push(rule.clone());
  rule.remove();
});
// The raws are explicit: postcss infers them from the first at-rule already in the tree, and
// every donor @media is minified (`@media(max-width:1320px){`), which would emit the guard as
// `@media(prefers-reduced-motion: no-preference){`.
const guard = postcss.atRule({
  name: 'media',
  params: '(prefers-reduced-motion: no-preference)',
  raws: {before: '\n\n', afterName: ' ', between: ' ', after: '\n'},
});
for (const frame of keyframes) {
  // Indentation only; the steps and declarations inside stay verbatim.
  frame.raws.before = '\n  ';
  if (typeof frame.raws.after === 'string' && frame.raws.after.includes('\n')) frame.raws.after = '\n  ';
  frame.walkRules((step) => {
    if (typeof step.raws.before === 'string' && step.raws.before.includes('\n')) step.raws.before = '\n    ';
  });
  guard.append(frame);
}
root.append(guard);

// The header deliberately spells no dropped selector with its leading dot, no Tailwind import
// directive and no unprefixed var() reference. The port test strips block comments before it
// matches selectors, but the rest of its assertions read the whole file.
const header = `/* Ported from the WiseTech donor app/globals.css at commit ${DONOR_COMMIT} (design-fidelity spec §4.2,
   errata E-9 to E-11). Generated by scripts/port-wisetech-css.mjs — run \`npm run port:wisetech\`
   to reproduce it; never hand-edit this file. Selectors are verbatim so it can be diffed against
   the donor. Mechanical transforms only: the donor's Tailwind import directive and its three
   top-level :root blocks removed (those tokens live in app/globals.css as --wt-*), every
   custom-property reference and declaration name renamed to its --wt- form and the two font
   variables to --font-serif / --font-sans, the focus colour routed through --wt-focus, keyframes
   moved behind prefers-reduced-motion: no-preference, and the donor-only portal, join-form,
   site-search-form, search-feedback, review-list, onboarding-actions and sr-only rules dropped
   (the six-step join form is not ported, the real /join flow is authoritative, and Tailwind
   provides the sr-only utility). The donor's own *, html { scroll-behavior; background } and body
   chrome rules are owned by globals.css. The two media-scoped token blocks stay, so the donor
   mobile heading sizes still override the clamped defaults below 520px. Three donor locals take
   the prefix with the tokens because the port declares or consumes them itself: --wt-accent (set
   by the .accent-* pill classes and read by .audience-card — unprefixed it would resolve against
   shadcn's --accent HSL triplet in globals.css and render an invalid colour), --wt-event-photo
   (set inline on the event hero) and --wt-mobile-menu-pad. .filter is a donor pill class;
   Tailwind's filter utility is unused in this codebase. */\n\n`;

const body = `${root.toString().trim()}\n`;

// Self-checks: the port must declare no unprefixed custom property and reference none either.
const strayProps = [...body.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/g)].map((match) => match[2]).filter((name) => !/^--(wt-|font-)/.test(name));
const strayRefs = [...body.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]).filter((name) => !/^--(wt-|font-)/.test(name));
if (strayProps.length > 0 || strayRefs.length > 0) {
  console.error('stray props:', [...new Set(strayProps)], 'stray refs:', [...new Set(strayRefs)]);
  process.exit(1);
}

// CRLF: the repository's ambient convention, and writing LF here would show the whole file as
// changed on the next checkout.
fs.mkdirSync(path.dirname(OUTPUT), {recursive: true});
fs.writeFileSync(OUTPUT, `${header}${body}`.replace(/\r?\n/g, '\r\n'));
console.log(`${OUTPUT}: ${root.nodes.length} top-level nodes, ${keyframes.length} keyframes`);
