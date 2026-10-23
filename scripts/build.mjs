import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderSite, escapeHTML } from '../src/render.mjs';
import { readInsights, insightRoutes, validateInsights, MEDIA_PATH } from '../src/insights/model.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const readJSON = name => JSON.parse(fs.readFileSync(path.join(root, 'config', name), 'utf8'));
export const releaseConfig = readJSON('release.json');
export const baseRouteConfig = readJSON('routes.json');
export const insightPosts = readInsights();
export const routeConfig = { ...baseRouteConfig, pages: [...new Set([...baseRouteConfig.pages, ...insightRoutes(insightPosts)])] };
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

export function headersFor(routes, production) {
  const policy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'none'";
  const htmlPaths = new Set(['/404.html']);
  for (const route of routes) {
    if (route.startsWith('/resources/insights/')) continue;
    htmlPaths.add(route);
    htmlPaths.add(`/${routeFile(route)}`);
    if (route !== '/') htmlPaths.add(route.slice(0, -1));
  }
  if (routes.some(route => route.startsWith('/resources/insights/'))) {
    htmlPaths.add('/resources/insights');
    htmlPaths.add('/resources/insights/*');
  }
  return [...htmlPaths].sort().map(route => `${route}\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: public, max-age=0, must-revalidate${!production || route === '/404.html' ? '\n  X-Robots-Tag: noindex, nofollow' : ''}\n`).join('\n') + '\n/_marketing/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n';
}

export function imageDimensions(bytes, extension) {
  if (extension === 'png') {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) throw new Error('Invalid PNG image');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG image');
    let cursor = 2;
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (cursor + 3 < bytes.length) {
      if (bytes[cursor++] !== 0xff) throw new Error('Invalid JPEG marker');
      while (bytes[cursor] === 0xff) cursor++;
      const marker = bytes[cursor++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (cursor + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(cursor);
      if (length < 2 || cursor + length > bytes.length) throw new Error('Invalid JPEG segment');
      if (frames.has(marker)) {
        if (length < 8) throw new Error('Invalid JPEG frame');
        return { width: bytes.readUInt16BE(cursor + 5), height: bytes.readUInt16BE(cursor + 3) };
      }
      cursor += length;
    }
    throw new Error('JPEG dimensions were not found');
  }
  if (extension === 'webp') {
    if (bytes.length < 25 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('Invalid WebP image');
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X' && bytes.length >= 30) return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (kind === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = bytes.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    throw new Error('Unsupported WebP image header');
  }
  throw new Error('Unsupported public image type');
}

export function packageInsightMedia(records, { mediaDirectory = path.join(root, 'src/insights/media') } = {}) {
  const media = new Map();
  for (const post of validateInsights(records)) for (const item of post.media) {
    const previous = media.get(item.src);
    if (previous && (previous.width !== item.width || previous.height !== item.height)) throw new Error('Conflicting metadata for shared Insights image');
    media.set(item.src, item);
  }
  const expected = new Set([...media.keys()].map(src => path.basename(src)));
  if (fs.existsSync(mediaDirectory)) {
    if (!fs.lstatSync(mediaDirectory).isDirectory() || fs.lstatSync(mediaDirectory).isSymbolicLink()) throw new Error('Public media directory must not be a symlink');
    for (const entry of fs.readdirSync(mediaDirectory, { withFileTypes: true })) if (!entry.isFile() || entry.isSymbolicLink() || !expected.has(entry.name)) throw new Error('Unreferenced, nested, or symlinked public media file');
  } else if (expected.size) throw new Error('Declared public media directory is missing');
  const files = new Map();
  for (const [src, item] of [...media].sort(([a], [b]) => a.localeCompare(b))) {
    const [, expectedHash, extension] = src.match(MEDIA_PATH);
    const filename = path.join(mediaDirectory, path.basename(src));
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw new Error('Public image must be a regular file of at most 10 MiB');
    const bytes = fs.readFileSync(filename);
    if (sha256(bytes) !== expectedHash) throw new Error('Public image hash does not match its declared filename');
    const dimensions = imageDimensions(bytes, extension);
    if (dimensions.width !== item.width || dimensions.height !== item.height) throw new Error('Public image dimensions do not match the declared metadata');
    files.set(src.slice(1), bytes);
  }
  return files;
}

export function createArtifact({ production = false, config = releaseConfig, routes = routeConfig } = {}) {
  validateConfig(config, routes, production);
  const files = new Map();
  const assets = {};
  for (const [key, filename] of Object.entries({ styles: 'styles.css', app: 'app.js', insights: 'insights.js', icon: 'icon.svg' })) {
    const source = fs.readFileSync(path.join(root, 'src/assets', filename));
    const parsed = path.parse(filename);
    const output = `_marketing/${parsed.name}.${sha256(source).slice(0, 12)}${parsed.ext}`;
    files.set(output, source);
    assets[key] = `/${output}`;
  }
  for (const [filename, bytes] of packageInsightMedia(insightPosts)) files.set(filename, bytes);
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
