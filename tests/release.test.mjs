import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createArtifact, buildSite, scanFiles, root, releaseConfig, routeConfig, compositionConfig, validateConfig, parseRedirectDestination, validateRenderedRedirectTargets, routeFile, isReserved } from '../scripts/build.mjs';
import { valueChains } from '../src/value-chains/render.mjs';
import { readInsights, insightRoutes, isSafeArticleHref } from '../src/insights/model.mjs';

const production = createArtifact({ production: true });
const preview = createArtifact();
const get = (artifact, filename) => artifact.files.get(filename)?.toString();
const html = (route, artifact = production) => get(artifact, routeFile(route));
const tags = (source, name) => [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(match => match[0]);
const attr = (tag, key) => tag.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`))?.[1];
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const pageHTML = () => [...production.files].filter(([name]) => name.endsWith('.html'));
const founderProfiles = [
  ['Ujjal Dutta', 'https://www.linkedin.com/in/ujjaldutta/'],
  ['Saurabh Amin', 'https://www.linkedin.com/in/saurabh-amin-361463239/'],
  ['Mathieu Dahan', 'https://www.linkedin.com/in/mathieudahan/'],
];
const migration = JSON.parse(fs.readFileSync(path.join(root, 'config/route-migration.json'), 'utf8'));
const insights = readInsights();
function approvedInsightHrefs(post) {
  const allowed = new Set([post.sourceUrl]);
  const addPlainURLs = text => {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'\u201C\u201D\u2018\u2019]+/g)) {
      let candidate = match[0].replace(/[.,;:!?]+$/, '');
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) while (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) candidate = candidate.slice(0, -1);
      if (isSafeArticleHref(candidate)) allowed.add(candidate);
    }
  };
  const addText = item => {
    if (typeof item === 'string') { addPlainURLs(item); return; }
    let cursor = 0;
    for (const link of item.links || []) {
      addPlainURLs(item.text.slice(cursor, link.start));
      allowed.add(link.href);
      cursor = link.end;
    }
    addPlainURLs(item.text.slice(cursor));
  };
  for (const block of post.blocks) {
    if (block.type === 'list') block.items.forEach(addText);
    else if (block.type !== 'image') addText(block);
  }
  return allowed;
}
const expectedRedirects = {
  ...migration.retiredPages,
  ...Object.fromEntries(Object.entries(migration.previousRedirects).map(([source, previous]) => [source, migration.legacyDestinationOverrides[source] || migration.retiredPages[previous] || previous])),
};

test('reviewed migration retains thirteen pages and flattens every retired or prior route', () => {
  assert.equal(migration.schemaVersion, 1);
  assert.deepEqual(migration.canonicalPages, [
    '/', '/solutions/', '/product/', '/capabilities/', '/industries/',
    '/resources/', '/resources/optimization-methods/', '/resources/manufacturing-decisions/',
    '/resources/wbg-policy-research/',
    '/security/', '/company/', '/diagnostic/', '/privacy/',
  ]);
  assert.equal(Object.keys(migration.retiredPages).length, 16);
  assert.equal(Object.keys(migration.previousRedirects).length, 23);
  for (const source of Object.keys(migration.legacyDestinationOverrides)) assert.ok(Object.hasOwn(migration.previousRedirects, source), `Unexpected override: ${source}`);
  const sources = [...Object.keys(migration.retiredPages), ...Object.keys(migration.previousRedirects)];
  assert.equal(new Set(sources).size, sources.length, 'Migration sources must not overlap');
  assert.deepEqual(routeConfig.pages, [...migration.canonicalPages, ...insightRoutes(insights)]);
  assert.deepEqual(routeConfig.redirects, expectedRedirects);
  for (const source of sources) {
    assert.equal(production.files.has(routeFile(source)), false, `Retired page is still published: ${source}`);
    assert.equal(get(production, 'sitemap.xml').includes(`${releaseConfig.siteUrl}${source}`), false, `Retired URL is in the sitemap: ${source}`);
    const { pathname } = parseRedirectDestination(routeConfig.redirects[source], routeConfig);
    assert.equal(Object.hasOwn(routeConfig.redirects, pathname), false, `Redirect chain or loop: ${source}`);
  }
});

test('explicit public routes and packaged assets are complete and isolated', () => {
  assert.equal(routeConfig.pages.length, migration.canonicalPages.length + insightRoutes(insights).length);
  assert.equal(Object.keys(routeConfig.redirects).length, Object.keys(expectedRedirects).length);
  assert.deepEqual(Object.keys(valueChains).sort(), ['manufacturing-decisions', 'optimization-methods']);
  const expected = new Set([...routeConfig.pages.map(routeFile), '404.html', 'sitemap.xml', 'robots.txt', '_headers', '_redirects']);
  for (const [name] of production.files) {
    if (name.startsWith('_marketing/')) assert.match(name, /^_marketing\/(?:(?:styles\.[a-f0-9]{12}\.css|(?:app|insights)\.[a-f0-9]{12}\.js|icon\.[a-f0-9]{12}\.svg)|media\/[a-f0-9]{64}\.(?:png|jpg|jpeg|webp))$/);
    else assert.ok(expected.delete(name), `Unexpected artifact file: ${name}`);
    assert.equal(isReserved(`/${name}`), false, `Application collision: ${name}`);
  }
  assert.equal(expected.size, 0);
  const mediaCount = new Set(insights.flatMap(post => post.media.map(item => item.src))).size;
  assert.equal(production.files.size, routeConfig.pages.length + 9 + mediaCount);
  assert.ok(compositionConfig.reservedAppPrefixes.includes('/__app'));
});

test('page metadata, unique IDs, internal links, anchors, and control references resolve', () => {
  for (const [name, bytes] of pageHTML()) {
    const source = bytes.toString();
    assert.equal(tags(source, 'h1').length, 1, name);
    assert.equal(tags(source, 'title').length, 1, name);
    assert.match(source, /<html lang="en"/, name);
    assert.match(source, /<meta name="description" content="[^"]+">/, name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, name);
    assert.match(source, /<meta name="twitter:card" content="summary">/, name);
    const ids = [...source.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs in ${name}`);
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `${name}: ${id}`);
    for (const [, reference] of source.matchAll(/\saria-(?:controls|labelledby)="([^"]+)"/g)) {
      for (const id of reference.split(' ')) assert.ok(ids.includes(id), `Broken ARIA reference ${name}: ${id}`);
    }
    for (const [, attribute, encoded] of source.matchAll(/\s(href|src)="([^"]+)"/g)) {
      let ref = decode(encoded);
      if (ref.startsWith('mailto:')) { assert.equal(ref, releaseConfig.contactUrl); continue; }
      if (name === 'company/index.html' && founderProfiles.some(([, url]) => ref === url)) {
        assert.equal(attribute, 'href', 'Profiles must be links, not embedded resources');
        assert.ok(tags(source, 'a').some(tag => attr(tag, 'href') === encoded), 'Profiles must be anchor links');
        continue;
      }
      if (/^https?:\/\//.test(ref) && !ref.startsWith(releaseConfig.siteUrl)) {
        const post = insights.find(item => name === `resources/insights/${item.slug}/index.html`);
        assert.ok(post, `External content links belong only to insight details: ${name}`);
        assert.ok(isSafeArticleHref(ref), `Unsafe insight link: ${ref}`);
        assert.ok(approvedInsightHrefs(post).has(ref), `Unreviewed insight link: ${ref}`);
        assert.equal(attribute, 'href', 'External references must not be embedded');
        assert.ok(tags(source, 'a').some(tag => attr(tag, 'href') === encoded), 'External references must be anchor links');
        continue;
      }
      if (ref.startsWith(releaseConfig.siteUrl)) {
        const url = new URL(ref);
        assert.equal(url.origin, releaseConfig.siteUrl);
        assert.equal(url.search, '');
        ref = `${url.pathname}${url.hash}`;
      }
      assert.ok(ref.startsWith('/') || ref.startsWith('#'), `Unexpected external or relative URL ${name}: ${ref}`);
      const [pathname, fragment] = ref.split('#');
      let targetHTML = source;
      if (pathname) {
        const file = pathname.startsWith('/_marketing/') ? pathname.slice(1) : routeFile(pathname);
        assert.ok(production.files.has(file), `Broken link ${name}: ${ref}`);
        targetHTML = get(production, file);
      }
      if (fragment) assert.ok(targetHTML.includes(`id="${fragment}"`), `Broken anchor ${name}: ${ref}`);
    }
    if (name === '404.html') {
      assert.match(source, /content="noindex, nofollow"/);
      assert.equal(source.includes('rel="canonical"'), false);
    } else {
      const route = routeConfig.pages.find(item => routeFile(item) === name);
      assert.ok(source.includes(`rel="canonical" href="${releaseConfig.siteUrl}${route}"`));
      assert.match(source, /content="index, follow"/);
      assert.match(get(preview, name), /content="noindex, nofollow"/);
    }
  }
});

test('article citation allowlists require declared rich links or complete unannotated URL text', () => {
  const profile = founderProfiles[1][1];
  const post = { sourceUrl: 'https://www.linkedin.com/posts/test/', blocks: [
    { type: 'paragraph', text: 'Saurabh', links: [{ start: 0, end: 7, href: profile }] },
    { type: 'list', items: [{ text: 'Paper', links: [{ start: 0, end: 5, href: 'https://example.com/paper' }] }, 'Read https://example.com/plain.'] },
    { type: 'paragraph', text: 'https://example.com/label', links: [{ start: 0, end: 25, href: 'https://example.com/target' }] },
  ] };
  const allowed = approvedInsightHrefs(post);
  assert.ok(allowed.has(profile));
  assert.ok(allowed.has('https://example.com/paper'));
  assert.ok(allowed.has('https://example.com/plain'));
  assert.ok(allowed.has('https://example.com/target'));
  assert.equal(allowed.has('https://example.com/label'), false);
  assert.equal(allowed.has('https://example.com/pla'), false);
  assert.equal(allowed.has(founderProfiles[0][1]), false);
  assert.equal(allowed.has('https://unreviewed.example/'), false);
  const css = fs.readFileSync(path.join(root, 'src/assets/styles.css'), 'utf8');
  assert.match(css, /\.insight-media img\s*\{[^}]*\bwidth:\s*auto;[^}]*max-width:\s*100%;/);
});

test('strict CSP is path-scoped and compatible with self-hosted markup', () => {
  const headers = get(production, '_headers');
  const scopes = headers.split('\n').filter(line => line.startsWith('/'));
  assert.equal(scopes.includes('/*'), false);
  assert.deepEqual(scopes.filter(scope => scope.includes('*')).sort(), ['/_marketing/*', '/resources/insights/*'].sort());
  for (const scope of scopes) assert.equal(isReserved(scope), false, scope);
  assert.match(headers, /default-src 'none'/);
  assert.match(headers, /form-action 'none'; connect-src 'none'/);
  assert.equal(headers.includes('unsafe-inline'), false);
  for (const [name, bytes] of pageHTML()) {
    const source = bytes.toString();
    assert.doesNotMatch(source, /\s(?:style|on[a-z]+)\s*=/i, name);
    for (const tag of tags(source, 'script')) assert.ok(attr(tag, 'src')?.startsWith('/_marketing/'), name);
    assert.equal(tags(source, 'style').length, 0, name);
    assert.equal(tags(source, 'form').length, 0, name);
  }
  for (const filename of ['app.js', 'insights.js']) {
    const script = fs.readFileSync(path.join(root, 'src/assets', filename), 'utf8');
    assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|\.submit\s*\(/, filename);
  }
  const styles = fs.readFileSync(path.join(root, 'src/assets/styles.css'), 'utf8');
  assert.doesNotMatch(styles, /@import|url\(/);
});

test('only exact legacy redirects exist and application ownership is protected', () => {
  const entries = get(production, '_redirects').trim().split('\n').map(line => line.split(' '));
  assert.equal(entries.length, Object.keys(expectedRedirects).length * 2);
  assert.equal(new Set(entries.map(([source]) => source)).size, entries.length);
  for (const [source, target, status] of entries) {
    assert.equal(status, '301');
    assert.equal(isReserved(source), false);
    const { pathname, fragment } = parseRedirectDestination(target, routeConfig);
    assert.equal(isReserved(pathname), false);
    assert.equal(source.includes('*'), false);
    assert.equal(target.includes('*'), false);
    assert.ok(routeConfig.pages.includes(pathname));
    if (fragment) assert.ok(html(pathname).includes(`id="${fragment}"`), `Missing redirect target: ${target}`);
    const canonicalSource = source.endsWith('/') ? source : `${source}/`;
    assert.equal(routeConfig.redirects[canonicalSource], target);
  }
  assert.equal(routeConfig.redirects['/company/programs-and-affiliations/'], '/company/#purpose');
  for (const prefix of compositionConfig.reservedAppPrefixes) {
    assert.equal(isReserved(prefix), true);
    assert.equal(isReserved(`${prefix}/nested/path`), true);
    assert.throws(() => validateConfig(releaseConfig, { ...routeConfig, pages: [...routeConfig.pages, `${prefix}/`] }, true), /reserved/);
  }
});

test('redirect destinations reject external, query, encoded, malformed, reserved, and chained targets', () => {
  for (const destination of [
    'https://outside.example/product/#workflow', `${releaseConfig.siteUrl}/product/#workflow`, '//outside.example/product/',
    '/product/?view=all', '/product/?view=all#workflow', '/product/#workflow?view=all',
    '/product/#%77orkflow', '/product/#workflow%20', '/product/#workflow%0a', '/product/#work_flow',
    '/product/#Workflow', '/product/#workflow/child', '/product/#workflow#other', '/product/#',
    '/product/#workflow ', '/product/#workflow\n', '/product/#workflow\t', '/product/#workflow--other',
    '/product/\n', '/product', '/product//', '/product/../company/', '/product/%2e%2e/company/',
    '/dashboard/#workflow', '/api/#workflow', '/assets/#workflow', '/__app/#workflow',
    '/company/contact/', '/missing/', '', null, 123,
  ]) {
    assert.throws(() => validateConfig(releaseConfig, { ...routeConfig, redirects: { '/retired/': destination } }, true), /Invalid redirect destination/, String(destination));
  }
  for (const source of ['/', '/product/', '/api/', '/retired/#part', '/retired/?query', '/retired/\n', '/retired', '/old*/']) {
    assert.throws(() => validateConfig(releaseConfig, { ...routeConfig, redirects: { [source]: '/product/#workflow' } }, true), /Invalid legacy redirect/, source);
  }
  for (const redirects of [null, [], 'invalid']) assert.throws(() => validateConfig(releaseConfig, { ...routeConfig, redirects }, true), /Invalid redirect map/);
  assert.deepEqual(parseRedirectDestination('/product/#workflow', routeConfig), { pathname: '/product/', fragment: 'workflow' });
  assert.deepEqual(parseRedirectDestination('/resources/', routeConfig), { pathname: '/resources/', fragment: undefined });
});

test('rendered redirect targets must exist exactly once before an artifact can be produced', () => {
  const routes = { pages: ['/product/'], redirects: { '/retired/': '/product/#workflow' } };
  const page = source => new Map([['/product/', source]]);
  assert.doesNotThrow(() => validateRenderedRedirectTargets(routes, page('<section id="workflow"></section>')));
  assert.throws(() => validateRenderedRedirectTargets(routes, new Map()), /Missing rendered redirect page/);
  assert.throws(() => validateRenderedRedirectTargets(routes, page('<section id="other"></section>')), /Missing redirect fragment/);
  assert.throws(() => validateRenderedRedirectTargets(routes, page('<a href="#workflow">Jump</a>')), /Missing redirect fragment/);
  assert.throws(() => validateRenderedRedirectTargets(routes, page('<section id="workflow"></section><div id="workflow"></div>')), /Duplicate rendered ID/);
  assert.throws(() => validateRenderedRedirectTargets(routes, page('<section id="workflow"></section><div id="other"></div><div id="other"></div>')), /Duplicate rendered ID/);
  assert.throws(() => createArtifact({ routes: { ...routeConfig, redirects: { ...routeConfig.redirects, '/retired/': '/product/#missing-target' } } }), /Missing redirect fragment/);
});

test('retired child summary fragments have an explicit final section destination', () => {
  const entries = get(production, '_redirects').trim().split('\n').map(line => line.split(' '));
  for (const [source, destination] of Object.entries(migration.retiredPages)) {
    const formerURL = new URL(`${source}#summary-title`, releaseConfig.siteUrl);
    const rule = entries.find(([from]) => from === formerURL.pathname);
    assert.ok(rule, `Missing retired-page redirect: ${source}`);
    const resolved = new URL(rule[1], formerURL);
    assert.equal(resolved.href, `${releaseConfig.siteUrl}${destination}`);
    assert.notEqual(resolved.hash, '');
    assert.notEqual(resolved.hash, '#summary-title');
    assert.ok(html(resolved.pathname).includes(`id="${resolved.hash.slice(1)}"`));
  }
});

test('search output covers canonical marketing pages only; preview is not indexable', () => {
  const sitemap = get(production, 'sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  assert.deepEqual(urls.sort(), routeConfig.pages.map(route => `${releaseConfig.siteUrl}${route}`).sort());
  assert.equal(sitemap.includes('404.html'), false);
  assert.equal(get(preview, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  assert.ok(get(production, 'robots.txt').includes(`Sitemap: ${releaseConfig.siteUrl}/sitemap.xml`));
  assert.equal(get(production, 'robots.txt').includes('Disallow: /\n'), false);
});

test('co-founders have exactly three named LinkedIn links and unchanged roles', () => {
  const list = html('/company/').match(/<ul class="compact-list founder-list">([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(list);
  const rows = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => match[1]);
  assert.equal(rows.length, founderProfiles.length);
  for (const [index, [name, url]] of founderProfiles.entries()) {
    const row = rows[index];
    assert.ok(row.includes(`<strong>${name}</strong><span>Co-founder</span>`));
    const anchors = tags(row, 'a');
    assert.equal(anchors.length, 1);
    assert.equal(attr(anchors[0], 'href'), url);
    assert.equal(attr(anchors[0], 'aria-label'), `${name} on LinkedIn`);
    assert.equal(attr(anchors[0], 'target'), undefined, 'Do not open unexpected new windows');
    assert.match(row, />LinkedIn<\/a>/);
  }
});

test('approved email opens the mail application and never claims a submitted form', () => {
  assert.equal(releaseConfig.contactUrl, 'mailto:ujjald@mit.edu?subject=Request%20a%20UNIFIDE%20diagnostic');
  for (const route of ['/company/', '/diagnostic/']) {
    const source = html(route);
    const contact = tags(source, 'a').filter(tag => tag.includes('data-contact-link'));
    assert.equal(contact.length, 1);
    assert.equal(decode(attr(contact[0], 'href')), releaseConfig.contactUrl);
    assert.ok(source.includes('The website does not submit or store your email message.'));
    assert.doesNotMatch(source, /message (?:sent|received)|thanks for submitting|six.week/i);
  }
  assert.throws(() => createArtifact({ production: true, config: { ...releaseConfig, contactUrl: '' } }), /requires an approved/);
  const noContact = createArtifact({ config: { ...releaseConfig, contactUrl: '' } });
  assert.match(html('/company/', noContact), /disabled>Contact unavailable/);
  for (const contactUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'mailto:bad', 'mailto:a@example.com?bcc=someone@example.com', 'mailto:a@example.com?subject=hello%0aInjected']) {
    assert.throws(() => createArtifact({ config: { ...releaseConfig, contactUrl } }));
  }
});

test('retained case source preserves reported scenario bounds and evidence status', () => {
  const equipment = valueChains['optimization-methods'];
  assert.deepEqual(equipment.scenarios.map(item => [item.capacity, item.served]), [[100, 97.5], [90, 88.1], [70, 68.1]]);
  for (const scenario of equipment.scenarios) {
    assert.ok(scenario.served >= 0 && scenario.served <= scenario.capacity);
  }
  const manufacturing = valueChains['manufacturing-decisions'];
  assert.deepEqual(manufacturing.records.map(item => item.value), ['26', '20', '5']);
  for (const id of ['test', 'release', 'ship']) assert.equal(manufacturing.stages.find(stage => stage.id === id).evidence.label, 'Not verified');
});

test('equipment case is a brief model summary with three sections and preserved bookmarks', () => {
  const source = html('/resources/optimization-methods/');
  const summary = source.match(/<article class="wrap category-content" aria-label="Case study summary">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(summary);
  assert.deepEqual([...summary.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match => match[1]), ['The problem', 'The overall approach', 'The value']);
  assert.equal(tags(source, 'h2').length, 3);
  assert.deepEqual(tags(summary, 'section').map(tag => attr(tag, 'id')), ['challenge', 'approach', 'findings']);
  assert.equal(tags(summary, 'p').length, 3);
  assert.ok(summary.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length <= 70);
  assert.match(summary, /An optimization model/);
  assert.match(summary, /purchasing, production, inventory, and shipments/);
  assert.match(summary, /how much customer demand/);
  assert.doesNotMatch(source, /case-facts|case-jump|case-related|data-value-chain|data-vc-|Reported model results|Academic case study|<button|<details(?! class="mobile-menu")/);
  const paragraphs = [...summary.matchAll(/<p>([^<]+)<\/p>/g)].map(match => match[1]).join(' ');
  assert.doesNotMatch(paragraphs, /\d|%|which supplier|customer orders|measured improvement/i);
  assert.match(html('/resources/'), /<p class="resource-kind">Model<\/p>/);
  assert.doesNotMatch(html('/resources/'), /Explore the value chain and compare reported supply scenarios/);
});

test('manufacturing case has only three short summary sections and preserves old anchors', () => {
  const source = html('/resources/manufacturing-decisions/');
  const summary = source.match(/<article class="wrap category-content" aria-label="Case study summary">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(summary);
  assert.deepEqual([...summary.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match => match[1]), ['The problem', 'The overall approach', 'The value']);
  assert.equal(tags(source, 'h2').length, 3);
  assert.deepEqual(tags(summary, 'section').map(tag => attr(tag, 'id')), ['challenge', 'approach', 'findings']);
  assert.equal(tags(summary, 'p').length, 3);
  const words = summary.replace(/<[^>]+>/g, ' ').trim().split(/\s+/);
  assert.ok(words.length <= 110, `Summary grew to ${words.length} words`);
  assert.match(summary, /ERP, CRM, and MES/);
  assert.match(summary, /AI post-trained for manufacturing tasks/);
  assert.match(summary, /uncertain demand, supply, and production/);
  assert.match(summary, /Keep human approval/);
  assert.match(summary, /Optimize inference for faster token generation/);
  assert.doesNotMatch(summary, /3[×x]|target awaiting benchmarking/);
  assert.doesNotMatch(source, /class="eyebrow"|Illustrative example—not a customer deployment/);
  assert.doesNotMatch(source, /case-facts|case-jump|case-related|data-value-chain|data-vc-|Worked example|5 personas|<button|<details(?! class="mobile-menu")/);
  assert.doesNotMatch(html('/resources/'), /Follow a customer commitment/);
});

test('Resources includes three distinct cases and the WBG summary stays short and static', () => {
  const listing = html('/resources/');
  for (const slug of ['optimization-methods', 'manufacturing-decisions', 'wbg-policy-research']) {
    assert.match(listing, new RegExp(`id="${slug}"`));
    assert.match(listing, new RegExp(`href="/resources/${slug}/"`));
  }
  assert.match(listing, /<h2 id="wbg-policy-research-title">WBG policy research<\/h2>/);
  const source = html('/resources/wbg-policy-research/');
  const summary = source.match(/<article class="wrap category-content" aria-label="Case study summary">([\s\S]*?)<\/article>/)?.[1];
  assert.ok(summary);
  assert.deepEqual([...summary.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match => match[1]), ['Overall problem', 'Value chain', 'Key outcomes']);
  assert.deepEqual(tags(summary, 'section').map(tag => attr(tag, 'id')), ['challenge', 'approach', 'findings']);
  const chain = summary.match(/<ol class="summary-chain"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  const outcomes = summary.match(/<ul class="summary-outcomes">([\s\S]*?)<\/ul>/)?.[1];
  assert.equal(tags(chain, 'li').length, 6);
  assert.equal(tags(outcomes, 'li').length, 3);
  assert.match(source, /Wide-bandgap semiconductors/);
  assert.match(summary, /Example route: silicon carbide for electric-vehicle traction/);
  assert.match(outcomes, /A framework/);
  assert.match(outcomes, /A way to examine/);
  assert.ok(summary.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length <= 200);
  assert.doesNotMatch(source, /case-facts|case-jump|case-related|data-value-chain|data-vc-|<button|<details(?! class="mobile-menu")|\.pdf|\.docx|external release|on hold|Local draft/i);
});

test('minimal public copy excludes retired labels and routes while preserving example context', () => {
  for (const [name, bytes] of pageHTML()) {
    assert.doesNotMatch(bytes.toString(), /synthetic|prototypes?|glasswing|glassing|scope\s*&(?:amp;)?\s*limits|Project notes/i, name);
  }
  assert.doesNotMatch(get(production, 'sitemap.xml'), /glasswing|glassing/i);
  assert.equal(routeConfig.redirects['/resources/glasswing-hackathon/'], '/resources/manufacturing-decisions/');
  assert.equal(production.files.has('resources/glasswing-hackathon/index.html'), false);
  assert.match(html('/resources/'), /<p class="resource-kind">Example<\/p>/);
  assert.match(html('/resources/'), /<p class="resource-kind">Model<\/p>/);
  for (const route of ['/resources/', '/resources/optimization-methods/', '/resources/manufacturing-decisions/']) {
    assert.doesNotMatch(html(route), /Illustrative model|Illustrative example/, route);
  }
  assert.match(html('/resources/optimization-methods/'), /An optimization model/);
});

test('repeated approach notice is removed everywhere without changing specific status copy', () => {
  for (const [name, bytes] of pageHTML()) {
    assert.doesNotMatch(bytes.toString(), /Proposed approach\. Scope, performance, and controls must be agreed and tested for each project\./, name);
  }
  for (const route of ['/product/', '/solutions/', '/capabilities/', '/industries/']) {
    assert.doesNotMatch(html(route), /class="release-boundary category-boundary"/, route);
  }
  assert.match(html('/product/'), /A proposed workspace/);
  assert.match(html('/industries/'), /exploratory areas/);
  assert.match(html('/security/'), /Proposed design principles/);
  assert.match(html('/security/'), /not a certification or a claim that these controls are deployed/);
  assert.match(html('/'), /In development/);
});

test('privacy notice is brief, marketing-scoped, and reachable from every footer', () => {
  const source = html('/privacy/');
  assert.ok(source.includes('marketing pages only, not the UNIFIDE application'));
  assert.ok(source.includes('Email buttons open your email application'));
  assert.ok(source.includes('You choose what to send'));
  assert.ok(source.includes('UNIFIDE uses enquiries to reply'));
  assert.ok(source.includes('do not send confidential business data'));
  assert.ok(source.includes('Cloudflare involves processing technical request data'));
  assert.ok(source.includes(`href="${releaseConfig.contactUrl}"`));
  assert.doesNotMatch(source, /GDPR.compliant|no cookies|no server logs|legally compliant/i);
  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  assert.ok(main.replace(/<[^>]+>/g, ' ').split(/\s+/).length < 120);
  for (const [name, bytes] of pageHTML()) assert.match(bytes.toString(), /<nav class="footer-links"[^>]*>[\s\S]*?<a href="\/privacy\/">Privacy<\/a>/, name);
});

test('invalid routes and origins fail closed before writing', () => {
  for (const route of ['/../private/', '/dashboard/', '/api/jobs/', '/wild*/', '/Upper/', '/no-trailing-slash']) assert.throws(() => createArtifact({ routes: { ...routeConfig, pages: [...routeConfig.pages, route] } }));
  assert.throws(() => createArtifact({ routes: { ...routeConfig, pages: [...routeConfig.pages, '/'] } }), /allowlist/);
  assert.throws(() => createArtifact({ routes: { ...routeConfig, pages: routeConfig.pages.slice(1) } }), /allowlist|redirect/);
  for (const siteUrl of ['http://example.com', 'https://example.com/', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com?query']) assert.throws(() => createArtifact({ config: { ...releaseConfig, siteUrl } }));
});

test('clean builds reproduce bytes, preserve sources, and reject altered output', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'unifide-release-test-'));
  const before = scanFiles(path.join(root, 'src'));
  try {
    const a = path.join(scratch, 'a', 'marketing-dist');
    const b = path.join(scratch, 'b', 'marketing-dist');
    const first = buildSite({ outputDir: a, production: true });
    const second = buildSite({ outputDir: b, production: true });
    assert.deepEqual(first.files, second.files);
    assert.equal(first.artifactHash, second.artifactHash);
    assert.deepEqual(scanFiles(a), first.files);
    assert.equal(buildSite({ outputDir: a, production: true }).artifactHash, first.artifactHash);
    fs.writeFileSync(path.join(a, 'unexpected.txt'), 'Do not remove this user file');
    assert.throws(() => buildSite({ outputDir: a }), /edited or unexpected/);
    assert.equal(fs.readFileSync(path.join(a, 'unexpected.txt'), 'utf8'), 'Do not remove this user file');
    fs.appendFileSync(path.join(b, 'index.html'), 'User edit');
    assert.throws(() => buildSite({ outputDir: b }), /edited or unexpected/);
    const c = path.join(scratch, 'c', 'marketing-dist');
    fs.mkdirSync(c, { recursive: true });
    fs.writeFileSync(path.join(c, 'index.html'), 'Unowned output');
    assert.throws(() => buildSite({ outputDir: c }), /trusted build state/);
    const d = path.join(scratch, 'd');
    fs.mkdirSync(d);
    fs.symlinkSync(c, path.join(d, 'marketing-dist'));
    assert.throws(() => buildSite({ outputDir: path.join(d, 'marketing-dist') }), /symlink/);
    assert.throws(() => buildSite({ outputDir: path.join(scratch, 'src') }), /dedicated/);
    assert.deepEqual(scanFiles(path.join(root, 'src')), before);
  } finally {
    fs.rmSync(scratch, { recursive: true });
  }
});
