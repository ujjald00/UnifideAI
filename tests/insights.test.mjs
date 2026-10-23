import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateInsights, readInsights, insightRoutes, insightBodyText, insightSearchText, normalizeInsightSearch, validateTextLinks, isSafeArticleHref } from '../src/insights/model.mjs';
import { renderInsightsPreview, renderInsightsArchive, renderInsightDetail, renderInsightText } from '../src/insights/render.mjs';
import { filterAndPaginate, normalizeSearch, enhanceInsights } from '../src/assets/insights.js';
import { headersFor, packageInsightMedia, imageDimensions, sha256, createArtifact, routeConfig, baseRouteConfig } from '../scripts/build.mjs';

const sample = (number = 1, overrides = {}) => ({ id: String(number), slug: `test-insight-${number}`, title: `Insight ${number}`, excerpt: 'A short introduction.', publishedAt: '2026-05-01', author: 'Ujjal Dutta', sourceUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${number}/`, topics: ['Semiconductors'], blocks: [{ type: 'paragraph', text: 'Original full text.\nSecond line remains unchanged.' }], media: [], ...overrides });
const clone = value => JSON.parse(JSON.stringify(value));

test('Insights validates the publication boundary, source identity, exact schema, and unchanged full text', () => {
  const original = [sample(1), sample(2, { publishedAt: '2026-06-01' })];
  const before = JSON.stringify(original);
  assert.deepEqual(validateInsights(original).map(post => post.id), ['2', '1']);
  assert.equal(JSON.stringify(original), before);
  assert.equal(insightBodyText(original[0]), original[0].blocks[0].text);
  for (const change of [
    { publishedAt: '2026-04-30' }, { publishedAt: '2026-02-30' }, { publishedAt: '2026-05-1' },
    { author: 'Someone else' }, { slug: '../escape' }, { slug: 'page' }, { id: '' }, { title: '' }, { excerpt: '' },
    { sourceUrl: 'https://www.linkedin.com/in/ujjaldutta/' }, { sourceUrl: 'https://linkedin.com.evil.test/posts/fake' },
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@www.linkedin.com/posts/example/' },
    { sourceUrl: 'https://www.linkedin.com/posts/example/?tracking=1' },
    { topics: ['AI', 'ai'] }, { topics: [' AI '] }, { blocks: [] },
    { blocks: [{ type: 'html', text: '<script>bad</script>' }] }, { blocks: [{ type: 'paragraph', text: 'Body', extra: 'Unexpected' }] },
  ]) assert.throws(() => validateInsights([sample(1, change)]), /Invalid insight/);
  assert.throws(() => validateInsights([{ ...sample(), privateNotes: 'Do not publish' }]), /unknown fields/);
  assert.throws(() => validateInsights([sample(), sample()]), /duplicate/);
  assert.throws(() => validateInsights([sample(), sample(2, { slug: sample().slug })]), /duplicate/);
  assert.throws(() => validateInsights([sample(), sample(2, { sourceUrl: sample().sourceUrl.replace('www.', '').replace(/\/$/, '') })]), /duplicate/);
});

test('reviewed posts yield exact native routes and only six latest preview cards', () => {
  const posts = Array.from({ length: 15 }, (_, index) => sample(index + 1, { publishedAt: `2026-05-${String(index + 1).padStart(2, '0')}` }));
  const routes = insightRoutes(posts);
  assert.equal(routes.length, 16);
  assert.equal(routes[0], '/resources/insights/');
  const preview = renderInsightsPreview(posts);
  assert.equal((preview.match(/class="insight-card"/g) || []).length, 6);
  assert.ok(preview.indexOf('test-insight-15/') < preview.indexOf('test-insight-14/'));
  assert.ok(preview.includes('id="latest-insights"'));
  assert.ok(preview.includes('View all insights'));
  assert.equal(preview.includes('test-insight-9/'), false);
  assert.deepEqual(routeConfig.pages, [...new Set([...baseRouteConfig.pages, ...insightRoutes(readInsights())])]);
});

test('month precision is honest in cards and detail markup without changing internal date sorting', () => {
  const month = sample(1, { publishedAt: '2026-08-17', datePrecision: 'month' });
  const day = sample(2, { publishedAt: '2026-08-18', datePrecision: 'day' });
  const defaultDay = sample(3, { publishedAt: '2026-08-19' });
  for (const render of [post => renderInsightsPreview([post]), post => renderInsightsArchive([post]), renderInsightDetail]) {
    const monthly = render(month);
    assert.ok(monthly.includes('<time datetime="2026-08">August 2026</time>'));
    assert.equal(monthly.includes('2026-08-17'), false);
    assert.equal(monthly.includes('August 17'), false);
    assert.ok(render(day).includes('<time datetime="2026-08-18">August 18, 2026</time>'));
    assert.ok(render(defaultDay).includes('<time datetime="2026-08-19">August 19, 2026</time>'));
  }
  assert.deepEqual(validateInsights([month, day, defaultDay]).map(post => post.id), ['3', '2', '1']);
  assert.equal(month.publishedAt, '2026-08-17');
  for (const datePrecision of ['year', 'Month', '', null, undefined, 1]) assert.throws(() => validateInsights([sample(1, { datePrecision })]), /date precision/);
});

test('archive exposes every article before scripting; controls are progressive and accessible', () => {
  const posts = Array.from({ length: 26 }, (_, index) => sample(index + 1));
  const html = renderInsightsArchive(posts);
  const articles = [...html.matchAll(/<article\b[^>]*>/g)].map(match => match[0]);
  assert.equal(articles.length, 26);
  assert.ok(articles.every(tag => !tag.includes(' hidden')));
  for (const post of posts) assert.ok(html.includes(`href="/resources/insights/${post.slug}/"`));
  assert.match(html, /data-insights-controls hidden/);
  assert.match(html, /data-insights-pagination[^>]* hidden/);
  assert.match(html, /<label for="insights-search">/);
  assert.match(html, /<label for="insights-topic">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  assert.doesNotMatch(html, /<form|<iframe|<script|\son\w+=|\sstyle=/);
});

test('full text is safely rendered with line breaks, lists, headings, and exact safe outbound URLs', () => {
  const paragraph = '<script>alert("x")</script>\nRead https://example.com/report?a=1&b=2. Also javascript:alert(1).';
  const post = sample(1, { blocks: [{ type: 'heading', text: 'A technical heading' }, { type: 'paragraph', text: paragraph }, { type: 'list', items: ['First original item', 'Second original item'] }] });
  const html = renderInsightDetail(post);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;<br>/);
  assert.match(html, /href="https:\/\/example.com\/report\?a=1&amp;b=2"/);
  assert.match(html, /<h2>A technical heading<\/h2>/);
  assert.match(html, /<li>First original item<\/li>/);
  assert.ok(html.includes(post.sourceUrl));
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.equal(renderInsightText('Read https://example.com/a_(b).'), 'Read <a href="https://example.com/a_(b)" rel="noopener noreferrer">https://example.com/a_(b)</a>.');
  assert.equal(renderInsightText('https://user:password@example.com/private'), 'https://user:password@example.com/private');
});

test('search is diacritic-insensitive full-text AND matching and filtering precedes bounded pagination', () => {
  const records = Array.from({ length: 26 }, (_, index) => ({ id: String(index), topics: [index % 2 ? 'AI' : 'Semiconductors'], search: normalizeSearch(`Original insight ${index} café value-chain`) }));
  assert.equal(normalizeSearch(' CAFÉ  value '), normalizeInsightSearch(' CAFÉ  value '));
  assert.equal(filterAndPaginate(records).items.length, 12);
  assert.equal(filterAndPaginate(records, { page: 3 }).items.length, 2);
  assert.equal(filterAndPaginate(records, { page: 100 }).page, 3);
  assert.equal(filterAndPaginate(records, { page: -3 }).page, 1);
  assert.equal(filterAndPaginate(records, { page: Infinity }).page, 1);
  assert.equal(filterAndPaginate(records, { query: 'CAFE value', topic: 'AI', page: 2 }).items.length, 1);
  assert.equal(filterAndPaginate(records, { query: '[.*]' }).total, 0);
  assert.equal(filterAndPaginate(records, { topic: 'Missing' }).page, 1);
  assert.equal(filterAndPaginate(records, { topic: 'Missing' }).start, 0);
  assert.throws(() => filterAndPaginate(records, { pageSize: 0 }));
  assert.ok(insightSearchText(sample()).includes('second line remains unchanged'));
});

test('rich links preserve exact labels, DOM order, Unicode, and heading levels without nested autolinks', () => {
  const text = 'Read NVIDIA & MIT, then https://example.com/visible.';
  const links = [
    { start: text.indexOf('NVIDIA'), end: text.indexOf('NVIDIA') + 6, href: 'https://www.nvidia.com/research/?a=1&b=2' },
    { start: text.indexOf('MIT'), end: text.indexOf('MIT') + 3, href: 'https://www.mit.edu/' },
    { start: text.indexOf('https://'), end: text.length - 1, href: 'https://example.com/original-target' },
  ];
  const rendered = renderInsightText(text, links);
  assert.equal((rendered.match(/<a /g) || []).length, 3);
  assert.ok(rendered.includes('>NVIDIA</a> &amp; <a '));
  assert.ok(rendered.includes('href="https://example.com/original-target" rel="noopener noreferrer">https://example.com/visible</a>.'));
  assert.equal(rendered.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&'), text);
  assert.equal(rendered.includes('href="https://example.com/visible"'), false);
  const body = [
    { type: 'heading', text: 'Original subheading', level: 3 },
    { type: 'paragraph', text, links },
    { type: 'list', items: ['Plain original item', { text: 'MIT paper', links: [{ start: 0, end: 3, href: 'https://www.mit.edu/' }] }] },
  ];
  const post = sample(1, { blocks: body });
  const before = JSON.stringify(post);
  const html = renderInsightDetail(post);
  assert.ok(html.includes('<h3>Original subheading</h3>'));
  assert.ok(html.includes('<li><a href="https://www.mit.edu/" rel="noopener noreferrer">MIT</a> paper</li>'));
  assert.equal(JSON.stringify(post), before);
  assert.equal(insightBodyText(post), `Original subheading\n\n${text}\n\nPlain original item\nMIT paper`);
  assert.ok(insightSearchText(post).includes('mit paper'));
  assert.equal(renderInsightText('🧠 AI', [{ start: 0, end: 2, href: 'https://example.com/' }]), '<a href="https://example.com/" rel="noopener noreferrer">🧠</a> AI');
});

test('rich annotations fail closed for unsafe URLs, overlaps, out-of-bounds offsets, and unsupported headings', () => {
  const safe = { start: 0, end: 3, href: 'https://example.com/' };
  for (const links of [
    [{ ...safe, start: -1 }], [{ ...safe, end: 99 }], [{ ...safe, start: 2, end: 2 }],
    [{ ...safe, start: 0.5 }], [{ ...safe, end: NaN }], [safe, { ...safe, start: 2, end: 4 }],
    [{ ...safe, start: 3, end: 5 }, safe], [{ ...safe, text: 'Changed label' }], null,
  ]) assert.throws(() => validateTextLinks('Original text', links), /Invalid insight/);
  for (const href of ['javascript:alert(1)', 'data:text/html,bad', '//example.com/', '/relative', 'https://user:secret@example.com/', 'https://example.com/\nunsafe', ' https://example.com/', 'https://example.com/ bad', 'https:\\example.com']) {
    assert.equal(isSafeArticleHref(href), false);
    assert.throws(() => renderInsightText('MIT', [{ ...safe, href }]), /HTTP/);
  }
  assert.throws(() => validateTextLinks('🧠 AI', [{ start: 1, end: 2, href: safe.href }]), /Unicode/);
  assert.throws(() => validateTextLinks('🧠 AI', [{ start: 0, end: 1, href: safe.href }]), /Unicode/);
  for (const block of [
    { type: 'heading', text: 'Heading', level: 1 }, { type: 'heading', text: 'Heading', level: 4 },
    { type: 'paragraph', text: 'Paragraph', level: 3 }, { type: 'list', items: [{ text: 'MIT', links: [{ ...safe, end: 4 }] }] },
  ]) assert.throws(() => validateInsights([sample(1, { blocks: [block] })]), /Invalid insight/);
});

function archiveHarness(count = 26) {
  const handlers = new Map();
  const names = ['controls', 'search', 'topic', 'clear', 'status', 'list', 'empty', 'pagination', 'previous', 'next', 'page-status'];
  const elements = Object.fromEntries(names.map(name => [name, { hidden: true, value: '', textContent: '', disabled: false, focusCount: 0, scrollCount: 0, addEventListener(event, handler) { handlers.set(`${name}:${event}`, handler); }, focus() { this.focusCount++; }, scrollIntoView() { this.scrollCount++; } }]));
  const nodes = Array.from({ length: count }, (_, index) => ({ hidden: false, dataset: { insightId: String(index), insightSearch: `insight ${index} ${index % 2 ? 'odd' : 'even'}`, insightTopics: JSON.stringify([index % 2 ? 'AI' : 'Semiconductors']) } }));
  const root = { dataset: { pageSize: '12' }, querySelector(selector) { return elements[selector.slice(15, -1)]; }, querySelectorAll() { return nodes; } };
  return { root, nodes, elements, handlers };
}

test('enhanced archive resets pagination on search/topic changes and preserves keyboard focus', () => {
  const { root, nodes, elements, handlers } = archiveHarness();
  assert.equal(enhanceInsights(root), true);
  assert.equal(elements.controls.hidden, false);
  assert.equal(nodes.filter(node => !node.hidden).length, 12);
  assert.equal(elements.previous.disabled, true);
  handlers.get('next:click')();
  assert.equal(elements['page-status'].textContent, 'Page 2 of 3');
  assert.equal(elements.list.focusCount, 1);
  elements.search.value = 'odd'; handlers.get('search:input')();
  assert.equal(elements['page-status'].textContent, 'Page 1 of 2');
  elements.topic.value = 'Semiconductors'; handlers.get('topic:change')();
  assert.equal(nodes.filter(node => !node.hidden).length, 0);
  assert.equal(elements.empty.hidden, false);
  assert.equal(elements.pagination.hidden, true);
  handlers.get('clear:click')();
  assert.equal(nodes.filter(node => !node.hidden).length, 12);
  assert.equal(elements.search.focusCount, 1);
  assert.equal(elements.empty.hidden, true);
  const invalid = archiveHarness(); invalid.nodes[0].dataset.insightTopics = 'bad JSON';
  assert.equal(enhanceInsights(invalid.root), false);
  assert.ok(invalid.nodes.every(node => !node.hidden), 'Failed enhancement must retain every article');
});

test('image blocks resolve declared metadata and unpositioned attachments remain visible', () => {
  const src = `/_marketing/media/${'a'.repeat(64)}.png`;
  const media = [{ src, alt: 'An explanatory diagram', width: 400, height: 300 }];
  const placed = sample(1, { media, blocks: [{ type: 'paragraph', text: 'Before image' }, { type: 'image', src }, { type: 'paragraph', text: 'After image' }] });
  const html = renderInsightDetail(placed);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.ok(html.indexOf('Before image') < html.indexOf('<img') && html.indexOf('<img') < html.indexOf('After image'));
  assert.match(html, /width="400" height="300" loading="lazy"/);
  assert.match(renderInsightDetail(sample(1, { media })), /<img /);
  assert.throws(() => validateInsights([sample(1, { blocks: [...sample().blocks, { type: 'image', src }] })]), /declared media/);
  for (const mutation of [{ src: 'https://example.com/image.png' }, { src: '../image.png' }, { width: 0 }, { alt: '' }, { unexpected: 'private' }]) assert.throws(() => validateInsights([sample(1, { media: [{ ...media[0], ...mutation }] })]));
});

test('media packager accepts only declared hash-matched local images with matching dimensions', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unifide-insights-media-test-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw1kAAAAASUVORK5CYII=', 'base64');
  const filename = `${sha256(png)}.png`;
  const src = `/_marketing/media/${filename}`;
  const post = sample(1, { media: [{ src, alt: 'Test pixel', width: 1, height: 1 }] });
  try {
    assert.deepEqual(imageDimensions(png, 'png'), { width: 1, height: 1 });
    fs.writeFileSync(path.join(directory, filename), png);
    const packaged = packageInsightMedia([post], { mediaDirectory: directory });
    assert.equal(packaged.size, 1);
    assert.ok(packaged.get(src.slice(1)).equals(png));
    const wrongSize = clone(post); wrongSize.media[0].width = 2;
    assert.throws(() => packageInsightMedia([wrongSize], { mediaDirectory: directory }), /dimensions/);
    fs.writeFileSync(path.join(directory, 'unreferenced.png'), png);
    assert.throws(() => packageInsightMedia([post], { mediaDirectory: directory }), /Unreferenced/);
    fs.unlinkSync(path.join(directory, 'unreferenced.png'));
    fs.writeFileSync(path.join(directory, filename), 'Changed bytes');
    assert.throws(() => packageInsightMedia([post], { mediaDirectory: directory }), /hash/);
    fs.unlinkSync(path.join(directory, filename));
    fs.symlinkSync(path.join(directory, 'missing'), path.join(directory, filename));
    assert.throws(() => packageInsightMedia([post], { mediaDirectory: directory }), /symlink/);
    assert.throws(() => imageDimensions(Buffer.from('<html>not an image</html>'), 'png'), /PNG/);
    assert.throws(() => imageDimensions(png, 'svg'), /Unsupported/);
  } finally { fs.rmSync(directory, { recursive: true }); }
});

test('Insights header scope remains bounded as the library grows and never captures the app', () => {
  const few = headersFor(['/', '/resources/insights/', '/resources/insights/one/'], true);
  const many = headersFor(['/', ...insightRoutes(Array.from({ length: 200 }, (_, index) => sample(index + 1)))], true);
  assert.equal(many, few);
  assert.equal(many.split('\n').filter(line => line === '/resources/insights/*').length, 1);
  assert.equal(many.includes('\n/*\n'), false);
  for (const prefix of ['/dashboard', '/login', '/demo', '/jobs', '/api', '/assets', '/__app']) assert.equal(many.includes(`\n${prefix}`), false);
  const artifact = createArtifact({ production: true });
  const archive = artifact.files.get('resources/insights/index.html').toString();
  assert.match(archive, /<script type="module" src="\/_marketing\/insights\.[a-f0-9]{12}\.js"><\/script>/);
  assert.doesNotMatch(archive, /fetch\(|<iframe/);
});
