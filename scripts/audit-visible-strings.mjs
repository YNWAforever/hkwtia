import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const roots = ['app', 'components'];
const sourceFiles = roots.flatMap((root) => collectTsxFiles(root));
const findings = [];
const allowedTechnicalIds = new Set([
  'AI-Ops', 'ASA', 'CPAI', 'HKICT', 'TCT', 'WTIA',
  'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
]);

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');

  for (const node of extractJsxTextNodes(source)) {
    const text = stripJsxExpressions(node.rawText).replace(/\s+/g, ' ').trim();
    if (!text || isAllowedLiteral(text, node.openingTag)) continue;

    const line = source.slice(0, node.textStart).split('\n').length;
    findings.push(`${file}:${line}: unapproved visible literal: ${JSON.stringify(text)}`);
  }
}

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

function extractJsxTextNodes(source) {
  const nodes = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '<' || !isLikelyOpeningTag(source, index)) continue;

    const tagEnd = findTagEnd(source, index);
    if (tagEnd < 0 || source[tagEnd - 1] === '/') {
      index = Math.max(index, tagEnd);
      continue;
    }

    const textStart = tagEnd + 1;
    const nextTag = findNextTagStart(source, textStart);
    if (nextTag < 0) continue;

    nodes.push({
      openingTag: source.slice(index, tagEnd + 1),
      rawText: source.slice(textStart, nextTag),
      textStart,
    });
    index = nextTag - 1;
  }

  return nodes;
}

function isLikelyOpeningTag(source, index) {
  const next = source[index + 1];
  if (next === '>' || /[A-Za-z]/.test(next ?? '')) {
    const previous = source[index - 1] ?? '';
    return !/[A-Za-z0-9_$.)\]]/.test(previous);
  }
  return false;
}

function findTagEnd(source, start) {
  let quote = '';
  let expressionDepth = 0;

  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') {
      expressionDepth += 1;
      continue;
    }
    if (character === '}' && expressionDepth > 0) {
      expressionDepth -= 1;
      continue;
    }
    if (character === '>' && expressionDepth === 0) return index;
  }

  return -1;
}

function findNextTagStart(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] !== '<') continue;
    const next = source[index + 1];
    if (next === '>' || next === '/' || /[A-Za-z]/.test(next ?? '')) return index;
  }
  return -1;
}

function stripJsxExpressions(value) {
  let depth = 0;
  let output = '';

  for (const character of value) {
    if (character === '{') {
      depth += 1;
      continue;
    }
    if (character === '}' && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0) output += character;
  }

  return output;
}

function isAllowedLiteral(text, openingTag) {
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text)) return true;
  if (/^\+?[0-9][0-9 ()-]+$/.test(text)) return true;
  if (allowedTechnicalIds.has(text)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(text)) return true;
  return /aria-hidden\s*=\s*["']true["']/i.test(openingTag);
}
