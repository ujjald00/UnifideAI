import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const requiredRewrites = ['/dashboard', '/demo', '/login', '/jobs/:id'];
const requiredNormalizations = { '/dashboard/': '/dashboard', '/demo/': '/demo', '/login/': '/login', '/jobs/:id/': '/jobs/:id' };
const requiredShellRedirects = { '/__app': '/dashboard', '/__app/': '/dashboard', '/__app/index.html': '/dashboard' };
const apiProbes = ['/api', '/api/', '/api/jobs', '/api/files/upload', '/api/chat/message'];
const appProbes = ['/dashboard', '/dashboard/', '/demo', '/login', '/jobs/example', '/jobs/example/child', '/__app', '/__app/', '/__app/index.html', '/__app/root-navigation.js', '/assets/index-Dn-nqYxi.js'];
const reserved = ['dashboard', 'demo', 'login', 'jobs', 'api', 'assets', '__app'];
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function within(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error(`Unsafe relative path: ${relative}`);
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Path escapes root');
  let component = path.resolve(root);
  for (const name of path.relative(root, file).split(path.sep)) {
    component = path.join(component, name);
    try {
      if (fs.lstatSync(component).isSymbolicLink()) throw new Error(`Symlink rejected: ${component}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return file;
}

export function filesIn(directory, prefix = '') {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Symlink rejected: ${directory}`);
  const output = {};
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${file}`);
    if (stat.isDirectory()) Object.assign(output, filesIn(file, relative));
    else if (stat.isFile()) output[relative] = sha256(fs.readFileSync(file));
    else throw new Error(`Non-regular file rejected: ${file}`);
  }
  return output;
}

export function sameFiles(actual, expected, label) {
  const normalized = value => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  if (normalized(actual) !== normalized(expected)) throw new Error(`${label} file hashes differ; refusing to overwrite or compose changed files`);
}

export function matches(pattern, pathname) {
  if (pattern.startsWith('https://')) pattern = new URL(pattern).pathname;
  const escaped = pattern.split('/').map(segment => segment === '*' ? '.*' : segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function parseRedirects(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    const parts = line.split(/\s+/);
    if (parts.length !== 3 || !/^\d{3}$/.test(parts[2])) throw new Error(`Invalid redirect: ${line}`);
    return { source: parts[0], destination: parts[1], status: Number(parts[2]) };
  });
}

export function parseHeaders(text) {
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) blocks.push({ pattern: line.trim(), headers: [] });
    else {
      if (!blocks.length) throw new Error('Header without path');
      blocks.at(-1).headers.push(line.trim());
    }
  }
  return blocks;
}

export function validateMarketingRouting(redirectText, headerText) {
  for (const rule of parseRedirects(redirectText)) {
    if (rule.source.includes('*') || rule.source.includes(':') || rule.status < 300 || rule.status >= 400) throw new Error(`Marketing redirect must be an exact 3xx: ${rule.source}`);
    for (const location of [rule.source, rule.destination]) {
      if (reserved.includes(location.split('/')[1])) throw new Error(`Marketing redirect enters reserved app path: ${location}`);
    }
  }
  for (const block of parseHeaders(headerText)) {
    const pathname = block.pattern.startsWith('https://') ? new URL(block.pattern).pathname : block.pattern;
    if (block.headers.some(header => /^Content-Security-Policy\s*:/i.test(header)) && (reserved.includes(pathname.split('/')[1]) || appProbes.some(probe => matches(block.pattern, probe)))) {
      throw new Error(`Marketing CSP applies to app route: ${block.pattern}`);
    }
  }
}

export function appWrapper(baselineHTML, bridgeOutput) {
  const marker = '    <script type="module" crossorigin src="/assets/index-Dn-nqYxi.js"></script>';
  if (baselineHTML.split(marker).length !== 2) throw new Error('Unexpected baseline bootstrap');
  const addition = `    <script src="/${bridgeOutput}"></script>\n`;
  return { html: baselineHTML.replace(marker, addition + marker), addition };
}

export function composeRelease(root = projectRoot) {
  root = fs.realpathSync(root);
  const config = readJSON(within(root, 'config/legacy-app.json'));
  if (JSON.stringify(config.rewrites) !== JSON.stringify(requiredRewrites)) throw new Error('Unexpected app route contract');
  if (JSON.stringify(config.normalizations) !== JSON.stringify(requiredNormalizations) || JSON.stringify(config.shellRedirects) !== JSON.stringify(requiredShellRedirects) || config.rewriteTarget !== '/__app/') throw new Error('Unexpected app normalization or shell contract');
  if (config.appEntry !== '__app/index.html' || config.bridgeOutput !== '__app/root-navigation.js' || config.bridgeSource !== 'legacy-app/root-navigation.js' || config.baselineDirectory !== 'legacy-app/baseline') throw new Error('Unexpected app composition paths');
  const marketing = within(root, 'marketing-dist');
  const output = within(root, 'dist');
  const stateFile = within(root, 'artifacts/composition-state.json');
  const marketingState = readJSON(within(root, 'marketing-build-state.json'));
  if (!['preview', 'production'].includes(marketingState.mode)) throw new Error('Unknown marketing build mode');
  const marketingFiles = filesIn(marketing);
  sameFiles(marketingFiles, marketingState.files, 'Marketing');
  if (!marketingFiles['index.html'] || !marketingFiles['404.html']) throw new Error('Marketing homepage and real 404 are required');
  for (const file of Object.keys(marketingFiles)) {
    if (reserved.includes(file.split('/')[0])) throw new Error(`Marketing/app asset collision: ${file}`);
    if (config.omittedAssets.includes(file)) throw new Error(`Omitted old homepage asset present: ${file}`);
    if (file.endsWith('.html') && /(?:images\/(?:rahman|sasa)\.jpg|Rahman Khorramfar|Sasa [A-Z])/.test(fs.readFileSync(within(marketing, file), 'utf8'))) throw new Error(`Old profile reference in marketing: ${file}`);
  }
  const marketingRedirects = fs.readFileSync(within(marketing, '_redirects'), 'utf8');
  const marketingHeaders = fs.readFileSync(within(marketing, '_headers'), 'utf8');
  validateMarketingRouting(marketingRedirects, marketingHeaders);
  const baselineDirectory = within(root, config.baselineDirectory);
  const baseline = {};
  for (const entry of config.baselineFiles) {
    const file = within(baselineDirectory, entry.file);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Baseline symlink rejected');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`Baseline hash mismatch: ${entry.file}`);
    baseline[entry.file] = bytes;
  }
  if (Object.keys(baseline).sort().join('|') !== 'assets/index-Dn-nqYxi.js|index.html') throw new Error('Unexpected preserved source files');
  const bridge = fs.readFileSync(within(root, config.bridgeSource));
  const wrapper = appWrapper(baseline['index.html'].toString('utf8'), config.bridgeOutput);
  const appRules = [
    ...Object.entries(config.normalizations).map(([source, destination]) => ({ source, destination, status: 301 })),
    ...Object.entries(config.shellRedirects).map(([source, destination]) => ({ source, destination, status: 301 })),
    ...config.rewrites.map(source => ({ source, destination: config.rewriteTarget, status: 200 })),
  ];
  // Cloudflare checks exact routes before parameterized routes; match that order explicitly.
  appRules.sort((a, b) => Number(a.source.includes(':')) - Number(b.source.includes(':')));
  const appRedirects = appRules.map(({ source, destination, status }) => `${source} ${destination} ${status}`);
  const redirects = `${marketingRedirects.trim()}\n\n# Preserved app routes only; no API or global SPA fallback.\n${appRedirects.join('\n')}\n`;
  const rules = parseRedirects(redirects);
  if (new Set(rules.map(rule => rule.source)).size !== rules.length) throw new Error('Duplicate redirect source');
  if (rules.some(rule => apiProbes.some(probe => matches(rule.source, probe)))) throw new Error('API route captured by redirect');
  const headerPaths = [...config.rewrites, ...Object.keys(config.normalizations), ...Object.keys(config.shellRedirects), `/${config.bridgeOutput}`];
  const headers = `${marketingHeaders.trim()}\n\n# App-specific bootstrap controls; intentionally no marketing CSP.\n${headerPaths.map(source => `${source}\n  X-Robots-Tag: noindex\n  Cache-Control: no-store`).join('\n\n')}\n`;
  if (fs.existsSync(output)) {
    if (!fs.existsSync(stateFile)) throw new Error('Existing dist is untracked; refusing to replace it');
    sameFiles(filesIn(output), readJSON(stateFile).files, 'Existing dist');
  }
  const stage = fs.mkdtempSync(path.join(root, '.compose-stage-'));
  let backup;
  let stateStage;
  try {
    for (const file of Object.keys(marketingFiles)) {
      const destination = within(stage, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(within(marketing, file), destination);
    }
    sameFiles(filesIn(stage), marketingFiles, 'Staged marketing');
    const additions = { [config.appEntry]: wrapper.html, [config.bridgeOutput]: bridge, 'assets/index-Dn-nqYxi.js': baseline['assets/index-Dn-nqYxi.js'], _redirects: redirects, _headers: headers };
    for (const [file, data] of Object.entries(additions)) {
      if (!['_redirects', '_headers'].includes(file) && marketingFiles[file]) throw new Error(`Output collision: ${file}`);
      const destination = within(stage, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, data);
    }
    const outputFiles = filesIn(stage);
    const state = { schemaVersion: 1, mode: marketingState.mode, marketingArtifactHash: marketingState.artifactHash, artifactHash: sha256(JSON.stringify(outputFiles)), files: outputFiles, originalBootstrapHash: config.baselineFiles[0].sha256, wrapperHash: outputFiles[config.appEntry], bridgeHash: sha256(bridge), omittedAssets: config.omittedAssets, routingChange: config.routingChange, backendStatus: config.backendStatus, productionGate: config.productionGate };
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    stateStage = fs.mkdtempSync(path.join(path.dirname(stateFile), '.composition-state-'));
    const nextStateFile = path.join(stateStage, 'state.json');
    fs.writeFileSync(nextStateFile, `${JSON.stringify(state, null, 2)}\n`);
    sameFiles(filesIn(marketing), marketingFiles, 'Marketing changed during composition');
    if (fs.existsSync(output)) {
      sameFiles(filesIn(output), readJSON(stateFile).files, 'Existing dist');
      backup = fs.mkdtempSync(path.join(root, '.compose-backup-'));
      fs.renameSync(output, path.join(backup, 'dist'));
    }
    let outputInstalled = false;
    try {
      fs.renameSync(stage, output);
      outputInstalled = true;
      fs.renameSync(nextStateFile, stateFile);
    }
    catch (error) {
      if (outputInstalled) fs.rmSync(output, { recursive: true });
      if (backup) fs.renameSync(path.join(backup, 'dist'), output);
      throw error;
    }
    return state;
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
    if (stateStage && fs.existsSync(stateStage)) fs.rmSync(stateStage, { recursive: true });
    if (backup && fs.existsSync(backup) && fs.readdirSync(backup).length === 0) fs.rmdirSync(backup);
    else if (backup && fs.existsSync(backup) && fs.existsSync(output) && fs.existsSync(stateFile)) {
      sameFiles(filesIn(output), readJSON(stateFile).files, 'Installed dist before old-build cleanup');
      fs.rmSync(backup, { recursive: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = composeRelease();
  console.log(`Composed ${Object.keys(result.files).length} files (${result.mode}); app backend remains unverified.`);
}
