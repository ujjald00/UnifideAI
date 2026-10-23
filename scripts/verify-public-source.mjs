import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

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
function git(args, binary = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: binary ? undefined : 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || 'Git inspection failed');
  return result.stdout;
}
const files = staged ? git(['ls-files', '--cached', '-z']).split('\0').filter(Boolean) : await walk(root);
const errors = [];
const postsPath = 'src/insights/posts.json';
const insightPosts = files.includes(postsPath) ? JSON.parse(staged ? git(['show', `:${postsPath}`]) : await fs.readFile(path.join(root, postsPath), 'utf8')) : [];
const declaredMedia = new Set(insightPosts.flatMap(post => (post.media || []).map(media => `src/insights/media/${media.src.split('/').pop()}`)));
for (const relative of files.sort()) {
  const top = relative.split('/')[0];
  if (!(allowedFiles.has(relative) || (relative.includes('/') && allowedRoots.has(top)))) errors.push(`Unapproved source path: ${relative}`);
  if (blockedNames.test(relative) || blockedExtensions.test(relative)) errors.push(`Restricted source file: ${relative}`);
  if (relative.startsWith('.github/') && !relative.startsWith('.github/workflows/')) errors.push(`Review GitHub metadata: ${relative}`);
  if (/\.(?:png|jpg|jpeg|webp)$/i.test(relative)) {
    const match = relative.match(/^src\/insights\/media\/([a-f0-9]{64})\.(png|jpg|jpeg|webp)$/);
    if (!match || !declaredMedia.has(relative)) { errors.push(`Unreviewed binary media: ${relative}`); continue; }
    const bytes = staged ? git(['show', `:${relative}`], true) : await fs.readFile(path.join(root, relative));
    const signatureValid = match[2] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ['jpg','jpeg'].includes(match[2]) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!signatureValid || bytes.length > 10 * 1024 * 1024 || crypto.createHash('sha256').update(bytes).digest('hex') !== match[1]) errors.push(`Invalid or changed media: ${relative}`);
    continue;
  }
  const text = staged ? git(['show', `:${relative}`]) : await fs.readFile(path.join(root, relative), 'utf8');
  if (text.includes('\0')) errors.push(`Unreviewed binary source: ${relative}`);
  if (secretPatterns.some(pattern => pattern.test(text))) errors.push(`Potential credential in ${relative}`);
  if (relative !== 'scripts/verify-public-source.mjs' && /(?:\/Users\/|\/private\/tmp\/|file:\/\/)/.test(text)) errors.push(`Local-only reference in ${relative}`);
  if (relative !== 'scripts/verify-public-source.mjs' && /\bTCIP WBG Policy\b|qualified deployability.*capital.commitment/i.test(text)) errors.push(`Held research text requires review: ${relative}`);
}
for (const media of declaredMedia) if (!files.includes(media)) errors.push(`Missing declared media: ${media}`);
if (!files.length) errors.push('No source files were inspected');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public-source check passed: ${files.length} ${staged ? 'staged' : 'working-tree'} files. Manual content review remains required.`);
}
