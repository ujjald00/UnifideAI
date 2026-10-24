import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createArtifact } from '../scripts/build.mjs';
import { primaryNavigation, homeContent, founders } from '../src/home-content.mjs';
import { content } from '../src/render.mjs';

const artifact = createArtifact({ production: true });
const source = artifact.files.get('index.html').toString();
const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const plain = text => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const ids = ['solutions', 'platform', 'technology', 'industries', 'resources', 'company'];

test('homepage offers six complete sections in the agreed order before scripting', () => {
  assert.deepEqual([...main.matchAll(/<section class="home-section" id="([^"]+)"/g)].map(match => match[1]), ids);
  assert.deepEqual([...main.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match => match[1]), primaryNavigation.map(item => item.label));
  for (const id of ids) assert.match(main, new RegExp(`id="${id}" data-home-section tabindex="-1" aria-labelledby="${id}-title"`));
  assert.equal((main.match(/<h1\b/g) || []).length, 1);
  assert.match(main, /Make better enterprise decisions and actions\./);
  assert.match(main, /AI models and optimization for complex operations\./);
  assert.match(main, /A proposed workspace/);
  assert.match(main, /exploratory areas/);
  assert.match(main, /UNIFIDE is developing tools/);
  assert.doesNotMatch(main, /\shidden|<details|<iframe|<video|<canvas|data-value-chain|3[×x]/);
  const words = plain(main).split(/\s+/).length;
  assert.ok(words >= 300 && words <= 500, `Homepage copy budget: ${words} words`);
});

test('homepage keeps three items per group and all three case studies plus Insights', () => {
  for (const id of ['solutions', 'platform', 'technology', 'industries']) {
    assert.equal(homeContent[id].items.length, 3, id);
    assert.equal(new Set(homeContent[id].items.map(item => item.title)).size, 3, id);
    for (const item of homeContent[id].items) assert.ok(main.includes(`href="${item.href}"`), `${id}: ${item.href}`);
  }
  assert.deepEqual(content.cases.map(study => study.slug).sort(), Object.keys(homeContent.resources.summaries).sort());
  for (const study of content.cases) {
    assert.ok(main.includes(`href="/resources/${study.slug}/"`));
    assert.ok(main.includes(study.title));
  }
  assert.match(main, /href="\/resources\/insights\/">Explore Insights/);
  for (const founder of founders) assert.ok(main.includes(`href="${founder.linkedin}"`));
  const workflow = main.match(/<ol class="home-workflow"[^>]*>([\s\S]*?)<\/ol>/)[1];
  assert.deepEqual([...workflow.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match => match[1]), ['Evidence', 'Options', 'Human review']);
  assert.equal((main.match(/class="button button-primary"/g) || []).length, 2, 'Only hero and closing contact have primary buttons');
});

function scrollHarness({ home = true } = {}) {
  const handlers = new Map();
  const frames = [];
  const sections = ids.map((id, index) => ({ id, top: 500 + index * 500, getBoundingClientRect() { return { top: this.top - window.scrollY }; } }));
  const links = [...ids, ...ids].map(id => ({
    dataset: { sectionLink: id },
    current: null, active: false,
    classList: { toggle(name, active) { links.find(link => link.classList === this).active = active; } },
    setAttribute(name, value) { this.current = value; },
    removeAttribute() { this.current = null; },
  }));
  const target = { focused: 0, focus(options) { this.focused++; assert.equal(options.preventScroll, true); } };
  const jump = { hash: '#technology', pathname: '/', addEventListener: (type, fn) => handlers.set(`jump:${type}`, fn) };
  const document = {
    documentElement: { scrollHeight: 3800 },
    querySelector: selector => selector === '.site-header' ? { getBoundingClientRect: () => ({ bottom: 68 }) } : null,
    querySelectorAll: selector => selector === '[data-home-section]' ? (home ? sections : []) : selector === '[data-section-link]' ? links : selector === '.on-page a, .skip-link, [data-section-link], .home-explore' ? [jump] : [],
    getElementById: id => id === 'technology' ? target : null,
    addEventListener: () => {},
  };
  const window = {
    scrollY: 0, innerHeight: 800, location: { pathname: '/' },
    matchMedia: () => ({ addEventListener: () => {} }),
    addEventListener: (type, fn, options) => handlers.set(type, { fn, options }),
    requestAnimationFrame: fn => frames.push(fn),
  };
  vm.runInNewContext(fs.readFileSync(new URL('../src/assets/app.js', import.meta.url), 'utf8'), { document, window });
  const flush = () => { while (frames.length) frames.shift()(); };
  const current = () => links.filter(link => link.active).map(link => link.dataset.sectionLink);
  return { window, handlers, frames, links, target, jump, flush, current };
}

test('active-section highlight follows scroll, history events, and the final section without moving focus', () => {
  const h = scrollHarness();
  assert.deepEqual(h.current(), []);
  assert.equal(h.handlers.get('scroll').options.passive, true);
  h.window.scrollY = 450;
  h.handlers.get('scroll').fn();
  h.handlers.get('scroll').fn();
  assert.equal(h.frames.length, 1, 'Only one pending animation frame');
  h.flush();
  assert.deepEqual(h.current(), ['solutions', 'solutions']);
  assert.equal(h.links[0].current, 'location');
  for (const event of ['resize', 'hashchange', 'pageshow']) {
    h.window.scrollY = 1450;
    h.handlers.get(event).fn();
    h.flush();
    assert.deepEqual(h.current(), ['technology', 'technology'], event);
  }
  h.window.scrollY = 3000;
  h.handlers.get('scroll').fn();
  h.flush();
  assert.deepEqual(h.current(), ['company', 'company']);
  h.window.scrollY = 0;
  h.handlers.get('scroll').fn();
  h.flush();
  assert.deepEqual(h.current(), []);
  assert.equal(h.target.focused, 0, 'Passive scroll must not steal keyboard focus');
});

test('anchor clicks preserve native navigation and modified/new-tab clicks never move focus', () => {
  const h = scrollHarness();
  const click = h.handlers.get('jump:click');
  const event = { button: 0, preventDefault() { throw new Error('Native anchor navigation must be preserved'); } };
  click(event);
  assert.equal(h.target.focused, 1);
  for (const modified of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) click({ ...event, ...modified });
  assert.equal(h.target.focused, 1);
  h.window.location.pathname = '/company/';
  click(event);
  assert.equal(h.target.focused, 1, 'A link to another page must not focus a local section');
  const detail = scrollHarness({ home: false });
  assert.equal(detail.handlers.has('scroll'), false, 'No homepage observer on detailed pages');
});
