import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staged = process.argv.includes('--staged');
const allowedRoots = new Set(['src', 'config', 'scripts', 'tests', 'legacy-app', 'docs', '.github']);
const allowedFiles = new Set(['README.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes', '.nvmrc', '.node-version']);
const ignoredRoots = new Set(['.git', 'node_modules', 'marketing-dist', 'dist', 'artifacts', '.wrangler']);
const ignoredGeneratedFiles = new Set(['marketing-build-state.json', 'release-build-state.json', 'composition-build-state.json']);
const blockedNames = /(?:^|\/)(?:\.DS_Store|\.env(?:\..*)?|\.openai|case-study-sources\.md|wbg\.mjs|case-study-expansion[^/]*|value-chains-update[^/]*)$/i;
const blockedExtensions = /\.(?:pdf|docx?|xlsx?|csv|pem|key|p12|sqlite|db|zip|tar|gz)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
async function walk(dir, prefix = '') {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!prefix && ignoredRoots.has(entry.name)) continue;
    if (!prefix && ignoredGeneratedFiles.has(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed in public source: ${relative}`);
    if (entry.isDirectory()) found.push(...await walk(path.join(dir, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Git inspection failed');
  return result.stdout;
}
const files = staged ? git(['ls-files', '--cached', '-z']).split('\0').filter(Boolean) : await walk(root);
const errors = [];
for (const relative of files.sort()) {
  const top = relative.split('/')[0];
  if (!(allowedFiles.has(relative) || (relative.includes('/') && allowedRoots.has(top)))) errors.push(`Unapproved source path: ${relative}`);
  if (blockedNames.test(relative) || blockedExtensions.test(relative)) errors.push(`Restricted source file: ${relative}`);
  if (relative.startsWith('.github/') && !relative.startsWith('.github/workflows/')) errors.push(`Review GitHub metadata: ${relative}`);
  const text = staged ? git(['show', `:${relative}`]) : await fs.readFile(path.join(root, relative), 'utf8');
  if (secretPatterns.some(pattern => pattern.test(text))) errors.push(`Potential credential in ${relative}`);
  if (relative !== 'scripts/verify-public-source.mjs' && /(?:\/Users\/|\/private\/tmp\/|file:\/\/)/.test(text)) errors.push(`Local-only reference in ${relative}`);
  if (relative !== 'scripts/verify-public-source.mjs' && /\bTCIP WBG Policy\b|qualified deployability.*capital.commitment/i.test(text)) errors.push(`Held research text requires review: ${relative}`);
}
if (!files.length) errors.push('No source files were inspected');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public-source check passed: ${files.length} ${staged ? 'staged' : 'working-tree'} files. Manual content review remains required.`);
}
