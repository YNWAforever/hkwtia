import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const roots = ['app', 'components'];
const sourceFiles = roots.flatMap((root) => collectTsxFiles(root));
const findings = [];
const allowedTechnicalIds = new Set([
  'AI-Ops', 'ASA', 'CPAI', 'HKICT', 'TCT', 'WTIA',
  'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
]);

// Punctuation that reads the same in English and Traditional Chinese, so it may
// be hard-coded in JSX. Everything else — colons, commas, full stops, question
// marks, straight quotes — differs between the locales and must come from the
// bundle or from lib/i18n/punctuation. This list replaced a blanket
// `/^[\p{P}\p{S}\s]+$/u` pass that was hiding eight ASCII colons rendering as
// `會員: 1` on the Chinese pages.
const localeNeutralGlyphs = new Set(['·', '•', '→', '←', '✓', '✗', '—', '–', '/', '|', '(', ')', '[', ']', '#']);

// Props whose string value is read aloud or shown to the user.
const visibleProps = new Set(['placeholder', 'aria-label', 'alt', 'title']);

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const node of collectJsxTextNodes(sourceFile)) {
    const text = node.rawText.replace(/\s+/g, ' ').trim();
    if (!text || isAllowedLiteral(text, node.ariaHidden)) continue;
    findings.push(`${locate(sourceFile, file, node.textStart)}: unapproved visible literal: ${JSON.stringify(text)}${separatorHint(text)}`);
  }

  for (const node of collectVisiblePropLiterals(sourceFile)) {
    findings.push(`${locate(sourceFile, file, node.start)}: untranslated ${node.prop}: ${JSON.stringify(node.text)}`);
  }

  for (const node of collectProseConstantsUsedInJsx(sourceFile)) {
    findings.push(`${locate(sourceFile, file, node.start)}: copy in the const \`${node.name}\`, rendered as JSX: ${JSON.stringify(node.text)} — move it into messages/*.json`);
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Visible-string audit passed (${sourceFiles.length} TSX files scanned).`);
}

function locate(sourceFile, file, position) {
  return `${file}:${sourceFile.getLineAndCharacterOfPosition(position).line + 1}`;
}

function separatorHint(text) {
  return /^[:：]$/.test(text) ? ' — use labelSeparator() from lib/i18n/punctuation' : '';
}

function collectTsxFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, {withFileTypes: true}).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(absolutePath);
    return entry.isFile() && absolutePath.endsWith('.tsx') ? [absolutePath] : [];
  });
}

function collectJsxTextNodes(sourceFile) {
  const nodes = [];

  function visit(node, inheritedAriaHidden) {
    if (ts.isJsxText(node)) {
      nodes.push({
        ariaHidden: inheritedAriaHidden,
        rawText: node.getText(sourceFile),
        textStart: node.getStart(sourceFile),
      });
      return;
    }

    let ariaHidden = inheritedAriaHidden;
    if (ts.isJsxElement(node)) {
      ariaHidden = ariaHidden || hasAriaHidden(node.openingElement.attributes);
    }
    if (ts.isJsxSelfClosingElement(node)) return;

    ts.forEachChild(node, (child) => visit(child, ariaHidden));
  }

  visit(sourceFile, false);
  return nodes;
}

/** String literals sitting directly in a placeholder / aria-label / alt / title. */
function collectVisiblePropLiterals(sourceFile) {
  const nodes = [];

  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      const prop = node.name.getText(sourceFile);
      const literal = visibleProps.has(prop) ? unwrapStringLiteral(node.initializer) : null;
      if (literal !== null && isProse(literal)) {
        nodes.push({prop, text: literal, start: node.getStart(sourceFile)});
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return nodes;
}

function unwrapStringLiteral(initializer) {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return null;
}

/**
 * English prose parked in a `const` and rendered through a JSX expression —
 * how the /zh/ai-ops architecture diagram shipped English nodes past an audit
 * that only ever read JsxText.
 *
 * The reference must appear in JSX *children*, not in an attribute. That is
 * what keeps the rule quiet about `className` strings, `cva()` variant maps and
 * the admin forms' `field` constants, and what lets a validation allowlist like
 * SECTION_HEADINGS — referenced only from plain code — stay unflagged without
 * needing an entry here.
 */
function collectProseConstantsUsedInJsx(sourceFile) {
  const referencedInJsxChildren = new Set();

  function findJsxChildReferences(node, insideJsxChild) {
    // An attribute is not a child, even nested inside one: `{rows.map(() => <input
    // className={field}/>)}` puts `field` in a prop, not in the text. Visible
    // props have their own rule; className strings are not copy.
    if (ts.isJsxAttribute(node)) insideJsxChild = false;
    else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      insideJsxChild = true;
    }
    if (insideJsxChild && ts.isIdentifier(node)) referencedInJsxChildren.add(node.text);
    ts.forEachChild(node, (child) => findJsxChildReferences(child, insideJsxChild));
  }
  findJsxChildReferences(sourceFile, false);

  const nodes = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && referencedInJsxChildren.has(node.name.text)) {
      const name = node.name.text;
      collectStringLiterals(node.initializer, (literal) => {
        if (isProse(literal.text)) nodes.push({name, text: literal.text, start: literal.getStart(sourceFile)});
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return nodes;
}

function collectStringLiterals(node, onLiteral) {
  // A const can hold a render function; the className strings inside its JSX
  // are not copy. Literal JSX *text* in such a function is still caught by the
  // JsxText pass, so nothing is lost by skipping attributes here.
  if (ts.isJsxAttribute(node)) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    onLiteral(node);
    return;
  }
  ts.forEachChild(node, (child) => collectStringLiterals(child, onLiteral));
}

/**
 * Two or more alphabetic words *separated by whitespace* — enough to be copy
 * rather than a token. The whitespace requirement is what distinguishes
 * "guarded tools" from a route like "/portal/events" or a slug, which read as
 * multi-word but are never translated.
 */
function isProse(text) {
  const trimmed = text.trim();
  if (allowedTechnicalIds.has(trimmed)) return false;
  if (/[一-鿿]/.test(trimmed)) return false;
  if (!/\s/.test(trimmed)) return false;
  return (trimmed.match(/\b[A-Za-z]{2,}\b/g) ?? []).length >= 2;
}

function hasAriaHidden(attributes) {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.text !== 'aria-hidden') continue;
    if (!property.initializer) return true;
    if (ts.isStringLiteral(property.initializer)) return property.initializer.text.toLowerCase() === 'true';
    if (ts.isJsxExpression(property.initializer)) {
      return property.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword;
    }
  }
  return false;
}

function isAllowedLiteral(text, ariaHidden) {
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text)) return true;
  if (/^\+?[0-9][0-9 ()-]+$/.test(text)) return true;
  if (allowedTechnicalIds.has(text)) return true;
  if ([...text].every((glyph) => localeNeutralGlyphs.has(glyph) || /\s/.test(glyph))) return true;
  return ariaHidden;
}
