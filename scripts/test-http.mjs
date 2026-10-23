import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeConfig } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isAPI = pathname => pathname === '/api' || pathname.startsWith('/api/');

export function localOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('HTTP checks require a bare loopback origin');
  return url.origin;
}

export async function testHTTP(value = 'http://127.0.0.1:4175') {
  const origin = localOrigin(value);
  const routes = routeConfig;
  const release = readJSON('config/release.json');
  const app = readJSON('config/legacy-app.json');
  const state = readJSON('artifacts/composition-state.json');
  const dist = path.join(root, 'dist');
  let requests = 0;
  let assertions = 0;
  const check = (condition, message) => { assertions++; assert.ok(condition, message); };
  const request = async (pathname, method = 'GET') => {
    check(pathname.startsWith('/') && !pathname.startsWith('//'), 'Only local absolute paths are permitted');
    const url = new URL(pathname, origin);
    check(url.origin === origin, 'Request escaped the loopback origin');
    check(!isAPI(url.pathname) || method === 'HEAD', 'API probes must use HEAD only');
    requests++;
    return fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  };
  const bytes = async (response, pathname) => {
    check(!isAPI(new URL(pathname, origin).pathname), 'API response bodies must not be read');
    const result = Buffer.from(await response.arrayBuffer());
    check(result.length <= (pathname.startsWith('/_marketing/media/') ? 10 : 2) * 1024 * 1024, `Unexpected response size: ${pathname}`);
    return result;
  };
  const type = response => response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const canonical = source => source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  const heading = source => [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => match[1]);
  const routeFile = route => route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
  const concurrent = async (items, action) => {
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
      while (cursor < items.length) { const item = items[cursor++]; await action(item); }
    }));
  };
  const passed = label => console.log(`PASS ${label}`);
  const marketingHTML = new Map();

  await concurrent(routes.pages, async route => {
    const response = await request(route);
    check(response.status === 200, `Marketing status ${response.status}: ${route}`);
    check(type(response) === 'text/html', `Marketing MIME: ${route}`);
    const source = (await bytes(response, route)).toString('utf8');
    const expected = fs.readFileSync(path.join(dist, routeFile(route)), 'utf8');
    check(source === expected, `Marketing content differs from local artifact: ${route}`);
    const h1 = heading(source);
    check(h1.length === 1 && h1[0] === heading(expected)[0], `Marketing H1: ${route}`);
    check(canonical(source) === `${release.siteUrl}${route}`, `Marketing canonical: ${route}`);
    check(response.headers.get('content-security-policy')?.includes("default-src 'none'") && response.headers.get('content-security-policy')?.includes("connect-src 'none'"), `Marketing CSP: ${route}`);
    check(response.headers.get('x-content-type-options') === 'nosniff', `Marketing nosniff: ${route}`);
    check(response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', `Marketing referrer policy: ${route}`);
    check(response.headers.get('permissions-policy')?.includes('camera=()'), `Marketing permissions policy: ${route}`);
    check(response.headers.get('cache-control')?.includes('must-revalidate'), `Marketing cache policy: ${route}`);
    marketingHTML.set(route, source);
  });
  passed(`${routes.pages.length} marketing pages: status, H1, canonical, MIME, security headers`);

  const legacy = Object.entries(routes.redirects).flatMap(([source, target]) => [[source, target], [source.slice(0, -1), target]]);
  const testRedirect = async ([source, destination], marketing = false) => {
    const response = await request(source, 'HEAD');
    check(response.status === 301, `Redirect status ${response.status}: ${source}`);
    const location = response.headers.get('location');
    check(Boolean(location), `Missing redirect destination: ${source}`);
    const target = new URL(location, origin);
    check(target.href === `${origin}${destination}`, `Unexpected redirect destination: ${source}`);
    if (marketing) {
      check(marketingHTML.has(target.pathname), `Redirect does not reach a final marketing page: ${source}`);
      check(!Object.hasOwn(routes.redirects, target.pathname), `Redirect chain or loop: ${source}`);
      if (target.hash) {
        const ids = [...marketingHTML.get(target.pathname).matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
        check(ids.filter(id => id === target.hash.slice(1)).length === 1, `Redirect fragment is missing or duplicated in served HTML: ${source}`);
      }
    }
  };
  await concurrent(legacy, entry => testRedirect(entry, true));
  passed(`${legacy.length} exact legacy redirects: Location, final 200 pages, and unique served fragment targets; no redirect was followed`);

  const excluded = [
    '/src/content.json', '/src/render.mjs', '/src/insights/posts.json', '/src/insights/model.mjs', '/config/release.json', '/config/routes.json', '/config/route-migration.json', '/package.json',
    '/.git/config', '/.env', '/marketing-build-state.json', '/artifacts/composition-state.json',
    '/docs/case-study-sources.md', '/value-chains/wbg.mjs',
    '/unknown-marketing-page', '/jobs', '/jobs/', '/jobs/http-probe/unsupported-child', '/dashboard/not-a-route',
  ];
  await concurrent(excluded, async route => {
    const response = await request(route);
    check(response.status === 404, `Excluded route status ${response.status}: ${route}`);
    check(type(response) === 'text/html', `404 MIME: ${route}`);
    const source = (await bytes(response, route)).toString('utf8');
    check(heading(source).length === 1 && heading(source)[0] === 'Page not found', `Missing real 404: ${route}`);
    check(source.includes('content="noindex, nofollow"'), `404 must not be indexed: ${route}`);
    check(!canonical(source), `404 has a canonical URL: ${route}`);
  });
  passed(`${excluded.length} private/source/excluded routes return the real 404`);

  const assets = Object.keys(state.files).filter(file => file.startsWith('_marketing/') || file.startsWith('assets/') || file === app.bridgeOutput);
  await concurrent(assets, async file => {
    const route = `/${file}`;
    const response = await request(route);
    check(response.status === 200, `Asset status ${response.status}: ${route}`);
    const mime = type(response);
    const expectedMime = { '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    check(file.endsWith('.js') ? ['application/javascript', 'text/javascript'].includes(mime) : mime === expectedMime[path.extname(file)], `Asset MIME: ${route}`);
    check(hash(await bytes(response, route)) === state.files[file], `Asset hash mismatch: ${route}`);
    if (file.startsWith('_marketing/')) check(response.headers.get('cache-control')?.includes('immutable'), `Marketing asset cache: ${route}`);
  });
  for (const baseline of app.baselineFiles.filter(file => file.file.startsWith('assets/'))) check(state.files[baseline.file] === baseline.sha256, 'Preserved bundle differs from the pinned source');
  passed(`${assets.length} assets: MIME and exact artifact hashes, including preserved app bundle`);

  const example = pattern => {
    check(!pattern.includes('*'), 'HTTP app probes require exact or parameter routes, not wildcards');
    return pattern.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g, 'http-probe');
  };
  const appRoutes = app.rewrites.map(example);
  await concurrent(appRoutes, async route => {
    const response = await request(route);
    check(response.status === 200, `App shell status ${response.status}: ${route}`);
    check(type(response) === 'text/html', `App shell MIME: ${route}`);
    check(hash(await bytes(response, route)) === state.files[app.appEntry], `App shell hash mismatch: ${route}`);
    check(!response.headers.get('content-security-policy'), `Marketing CSP leaked onto the app: ${route}`);
    check(response.headers.get('x-robots-tag')?.includes('noindex'), `App indexing policy: ${route}`);
    check(response.headers.get('cache-control')?.includes('no-store'), `App bootstrap cache policy: ${route}`);
  });
  const normalizations = Object.entries(app.normalizations || {}).map(([source, target]) => [example(source), example(target)]);
  await concurrent(normalizations, testRedirect);
  const shellRedirects = Object.entries(app.shellRedirects || {});
  await concurrent(shellRedirects, testRedirect);
  passed(`${appRoutes.length} preserved app shell routes, ${normalizations.length} route normalizations, and ${shellRedirects.length} direct shell aliases`);

  const apiRoutes = ['/api', '/api/', '/api/jobs', '/api/files/upload', '/api/chat/message'];
  await concurrent(apiRoutes, async route => {
    const response = await request(route, 'HEAD');
    check(response.status === 404, `Unexpected local API status ${response.status}: ${route}`);
    check(!response.headers.get('location'), `API route redirected: ${route}`);
    check(!response.headers.get('content-security-policy'), `Marketing CSP leaked onto API path: ${route}`);
    // Deliberately never consume an API response body, even on failure.
  });
  passed(`${apiRoutes.length} local API HEAD-only boundary checks; no backend functionality claimed`);
  return { origin, requests, assertions, marketingPages: routes.pages.length, legacyRedirects: legacy.length, assets: assets.length, appRoutes: appRoutes.length, appNormalizations: normalizations.length, shellAliases: shellRedirects.length, apiBodyReads: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node scripts/test-http.mjs [loopback-origin]');
    const result = await testHTTP(process.argv[2]);
    console.log(`PASS HTTP checks: ${result.requests} loopback requests, ${result.assertions} assertions, zero API body reads.`);
  } catch (error) {
    console.error(`FAIL HTTP check: ${error.message}`);
    process.exitCode = 1;
  }
}
