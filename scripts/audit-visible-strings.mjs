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

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const node of collectJsxTextNodes(sourceFile)) {
    const text = node.rawText.replace(/\s+/g, ' ').trim();
    if (!text || isAllowedLiteral(text, node.ariaHidden)) continue;

    const line = sourceFile.getLineAndCharacterOfPosition(node.textStart).line + 1;
    findings.push(`${file}:${line}: unapproved visible literal: ${JSON.stringify(text)}`);
  }
}

auditMessages();

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Visible-string audit passed (${sourceFiles.length} TSX files scanned).`);
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
  if (/^[\p{P}\p{S}\s]+$/u.test(text)) return true;
  return ariaHidden;
}

// Metadata keys are not UI labels. Every other message leaf is required.
function messageLeaves(value, prefix = '') {
  if (typeof value === 'string') return [[prefix, value]];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => key.startsWith('_') ? [] : messageLeaves(child, prefix ? prefix + '.' + key : key));
}

function interpolationTokens(value) {
  return [...new Set([...value.matchAll(/\{([A-Za-z_]\w*)\s*[,}]/g)].map((match) => match[1]))].sort().join(',');
}

function auditMessages() {
  const bundles = new Map();
  for (const locale of ['en', 'zh-HK']) {
    const file = path.join('messages', locale + '.json');
    try {
      const leaves = new Map(messageLeaves(JSON.parse(fs.readFileSync(file, 'utf8'))));
      bundles.set(locale, leaves);
      if (leaves.size === 0) findings.push(file + ": EMPTY_BUNDLE");
      for (const [key, value] of leaves) {
        if (!value.trim()) findings.push(file + ':' + key + ': EMPTY_LABEL');
        if (/\uFFFD/u.test(value)) findings.push(file + ':' + key + ': REPLACEMENT_CHARACTER');
        // A URL may use '?' as a query delimiter; only valid whole URLs qualify.
        let isUrl = false;
        try {const url = new URL(value); isUrl = ['https:', 'http:'].includes(url.protocol);} catch { /* UI text */ }
        if (!isUrl && /[?？]{2,}/u.test(value)) findings.push(file + ':' + key + ': CORRUPT_PLACEHOLDER');
      }
    } catch {findings.push(file + ': MESSAGES_UNREADABLE');}
  }
  const english = bundles.get('en');
  const chinese = bundles.get('zh-HK');
  if (!english || !chinese) return;
  for (const key of new Set([...english.keys(), ...chinese.keys()])) {
    if (!english.has(key) || !chinese.has(key)) {
      findings.push('messages:' + key + ': MISSING_KEY');
    } else if (interpolationTokens(english.get(key)) !== interpolationTokens(chinese.get(key))) {
      findings.push('messages:' + key + ': TOKEN_MISMATCH');
    }
  }
}
