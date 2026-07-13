import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const roots = ['app', 'components'];
const sourceFiles = roots.flatMap((root) => collectTsxFiles(root));
const findings = [];

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const literalPattern = />((?:[^<>{}\n]|\{[^}]*\})+)</g;

  for (const match of source.matchAll(literalPattern)) {
    const text = match[1].trim();
    if (!text || text.startsWith('{')) continue;

    // JSX expressions are intentionally excluded; only literal text nodes are audited.
    if (text.includes('{') || isAllowedLiteral(text, source.slice(0, match.index))) continue;

    const line = source.slice(0, match.index).split('\n').length;
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

function isAllowedLiteral(text, beforeMatch) {
  if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(text)) return true;
  if (/^\+?[0-9][0-9 ()-]+$/.test(text)) return true;
  if (/^(?:CPAI|TCT|AI-Ops|M\d+|[A-Z]{2,}[0-9]*)$/.test(text)) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(text)) return true;
  return /aria-hidden\s*=\s*["']true["'][^>]*>[^<]*$/i.test(beforeMatch);
}
