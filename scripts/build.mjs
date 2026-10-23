import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderSite, escapeHTML } from '../src/render.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const readJSON = name => JSON.parse(fs.readFileSync(path.join(root, 'config', name), 'utf8'));
export const releaseConfig = readJSON('release.json');
export const routeConfig = readJSON('routes.json');
export const compositionConfig = readJSON('composition.json');
const routePattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/;
const fragmentPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const isCanonicalRoute = route => typeof route === 'string' && routePattern.exec(route)?.[0] === route;
export const routeFile = route => route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
export const isReserved = route => compositionConfig.reservedAppPrefixes.some(prefix => route === prefix || route.startsWith(`${prefix}/`));

export function parseRedirectDestination(destination, routes) {
  if (typeof destination !== 'string') throw new Error('Invalid redirect destination');
  const [pathname, fragment, extra] = destination.split('#');
  if (!isCanonicalRoute(pathname) || isReserved(pathname) || !routes.pages.includes(pathname) || extra !== undefined || (fragment !== undefined && fragmentPattern.exec(fragment)?.[0] !== fragment)) {
    throw new Error(`Invalid redirect destination: ${destination}`);
  }
  return { pathname, fragment };
}

export function validateRenderedRedirectTargets(routes, pages) {
  const pageIds = new Map();
  for (const route of routes.pages) {
    const source = pages.get(route);
    if (typeof source !== 'string') throw new Error(`Missing rendered redirect page: ${route}`);
    const ids = [...source.matchAll(/\sid\s*=\s*(["'])([^"']*)\1/g)].map(match => match[2]);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate rendered ID: ${route}`);
    pageIds.set(route, new Set(ids));
  }
  for (const destination of Object.values(routes.redirects)) {
    const { pathname, fragment } = parseRedirectDestination(destination, routes);
    if (fragment !== undefined && !pageIds.get(pathname).has(fragment)) throw new Error(`Missing redirect fragment: ${destination}`);
  }
}

export function validateConfig(config, routes, production) {
  const site = new URL(config.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password || site.pathname !== '/' || site.search || site.hash || config.siteUrl.endsWith('/')) throw new Error('siteUrl must be a bare HTTPS origin without a trailing slash');
  if (config.contactUrl) {
    if (/[\r\n]|%0[ad]/i.test(config.contactUrl)) throw new Error('Invalid contact destination');
    const contact = new URL(config.contactUrl);
    const email = /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/;
    if (contact.protocol === 'mailto:') {
      if (!email.test(contact.pathname) || contact.hash || [...contact.searchParams.keys()].some(key => key !== 'subject')) throw new Error('Invalid mailto contact destination');
    } else if (contact.protocol !== 'https:' || contact.username || contact.password) throw new Error('Contact must use mailto or HTTPS');
  } else if (production) throw new Error('Production requires an approved contact destination');
  if (!Array.isArray(routes.pages) || !routes.pages.length || new Set(routes.pages).size !== routes.pages.length) throw new Error('Invalid page allowlist');
  for (const route of routes.pages) if (!isCanonicalRoute(route) || isReserved(route)) throw new Error(`Invalid or reserved marketing route: ${route}`);
  if (!routes.redirects || typeof routes.redirects !== 'object' || Array.isArray(routes.redirects)) throw new Error('Invalid redirect map');
  for (const [source, destination] of Object.entries(routes.redirects)) {
    if (!isCanonicalRoute(source) || source === '/' || isReserved(source) || routes.pages.includes(source)) throw new Error(`Invalid legacy redirect: ${source}`);
    parseRedirectDestination(destination, routes);
  }
  for (const route of config.searchDisallowPaths || []) if (!/^\/[a-z0-9/-]+$/.test(route)) throw new Error('Invalid search path');
}

function headersFor(routes, production) {
  const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'none'";
  const htmlPaths = new Set(['/404.html']);
  for (const route of routes) {
    htmlPaths.add(route);
    htmlPaths.add(`/${routeFile(route)}`);
    if (route !== '/') htmlPaths.add(route.slice(0, -1));
  }
  return [...htmlPaths].sort().map(route => `${route}\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: public, max-age=0, must-revalidate${!production || route === '/404.html' ? '\n  X-Robots-Tag: noindex, nofollow' : ''}\n`).join('\n') + '\n/_marketing/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n';
}

export function createArtifact({ production = false, config = releaseConfig, routes = routeConfig } = {}) {
  validateConfig(config, routes, production);
  const files = new Map();
  const assets = {};
  for (const [key, filename] of Object.entries({ styles: 'styles.css', app: 'app.js', icon: 'icon.svg' })) {
    const source = fs.readFileSync(path.join(root, 'src/assets', filename));
    const parsed = path.parse(filename);
    const output = `_marketing/${parsed.name}.${sha256(source).slice(0, 12)}${parsed.ext}`;
    files.set(output, source);
    assets[key] = `/${output}`;
  }
  const { pages, notFound } = renderSite(config, assets, { production });
  if (JSON.stringify([...pages.keys()].sort()) !== JSON.stringify([...routes.pages].sort())) throw new Error('Rendered routes do not match the explicit page allowlist');
  validateRenderedRedirectTargets(routes, pages);
  for (const route of [...routes.pages].sort()) files.set(routeFile(route), pages.get(route));
  files.set('404.html', notFound);
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...routes.pages].sort().map(route => `  <url><loc>${escapeHTML(`${config.siteUrl}${route}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
  files.set('robots.txt', production ? `User-agent: *\n${(config.searchDisallowPaths || []).map(route => `Disallow: ${route}`).join('\n')}\nSitemap: ${config.siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
  files.set('_headers', headersFor(routes.pages, production));
  files.set('_redirects', Object.entries(routes.redirects).sort(([a], [b]) => a.localeCompare(b)).flatMap(([source, target]) => [`${source} ${target} 301`, `${source.slice(0, -1)} ${target} 301`]).join('\n') + '\n');
  const ordered = new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
  for (const [filename, data] of ordered) ordered.set(filename, Buffer.isBuffer(data) ? data : Buffer.from(data));
  const hashes = Object.fromEntries([...ordered].map(([filename, data]) => [filename, sha256(data)]));
  const state = { schemaVersion: 1, mode: production ? 'production' : 'preview', files: hashes, artifactHash: sha256(JSON.stringify(hashes)) };
  return { files: ordered, state };
}

export function scanFiles(directory) {
  const result = {};
  const walk = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in output: ${relative}`);
      if (entry.isDirectory()) walk(full, `${relative}/`);
      else if (entry.isFile()) result[relative] = sha256(fs.readFileSync(full));
      else throw new Error(`Unexpected output entry: ${relative}`);
    }
  };
  walk(directory);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function buildSite({ outputDir = path.join(root, 'marketing-dist'), ...options } = {}) {
  const target = path.resolve(outputDir);
  if (path.basename(target) !== 'marketing-dist' || target === root || target.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Output must be a dedicated marketing-dist directory');
  const statePath = path.join(path.dirname(target), 'marketing-build-state.json');
  const { files, state } = createArtifact(options);
  if (fs.existsSync(target)) {
    if (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink()) throw new Error('Refusing non-directory or symlink output');
    const actual = scanFiles(target);
    if (Object.keys(actual).length) {
      if (!fs.existsSync(statePath) || fs.lstatSync(statePath).isSymbolicLink()) throw new Error('Refusing existing output without a trusted build state');
      const previous = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (previous.schemaVersion !== 1 || JSON.stringify(actual) !== JSON.stringify(previous.files)) throw new Error('Refusing to replace edited or unexpected output files');
    }
  }
  if (fs.existsSync(statePath) && fs.lstatSync(statePath).isSymbolicLink()) throw new Error('Refusing symbolic link build state');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.marketing-build-'));
  try {
    for (const [filename, data] of files) {
      const full = path.join(staging, filename);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, data, { flag: 'wx' });
    }
    // Only a verified, generated tree can reach this replacement step.
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
    fs.renameSync(staging, target);
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    throw error;
  }
  return { outputDir: target, statePath, ...state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.version !== 'v24.19.0') throw new Error('Use the pinned Node 24.19.0 runtime');
  if (process.argv.slice(2).some(arg => arg !== '--production')) throw new Error('Only --production is supported');
  const result = buildSite({ production: process.argv.includes('--production') });
  console.log(`Built ${routeConfig.pages.length} marketing pages (${result.mode}), ${Object.keys(result.files).length} files. Artifact SHA256: ${result.artifactHash}`);
}
