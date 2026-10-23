import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createArtifact, routeFile } from '../scripts/build.mjs';
import { categoryContent } from '../src/category-content.mjs';

const artifact = createArtifact({ production: true });
const html = route => artifact.files.get(routeFile(route)).toString();
const categoryRoutes = ['/solutions/', '/product/', '/capabilities/', '/industries/', '/resources/', '/company/'];
const links = text => [...text.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
const textOnly = text => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('every page offers six direct links and a native, unnested mobile menu', () => {
  for (const [name, bytes] of artifact.files) {
    if (!name.endsWith('.html')) continue;
    const source = bytes.toString();
    const desktop = source.match(/<nav class="desktop-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    const mobile = source.match(/<details class="mobile-menu">([\s\S]*?)<\/details>/)?.[1];
    assert.ok(desktop && mobile, name);
    assert.deepEqual(links(desktop), categoryRoutes, name);
    assert.deepEqual(links(mobile), categoryRoutes, name);
    assert.match(mobile, /<summary class="menu-button" aria-label="Navigation menu">/);
    assert.doesNotMatch(mobile, /<details|<button|\shidden/);
    assert.doesNotMatch(source, /data-dropdown|nav-trigger|menu-children/);
    assert.match(source, /<main id="main" tabindex="-1"/);
    assert.match(source, /href="\/company\/#contact"/);
  }
});

test('category pages are concise, distinct, and fully available before scripting', () => {
  for (const route of [...categoryRoutes, '/security/']) {
    const source = html(route);
    const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
    const count = [...main.matchAll(/<section class="category-section"/g)].length;
    assert.equal(count, route === '/resources/' ? 2 : 3, route);
    assert.ok(textOnly(main).split(/\s+/).length <= 250, route);
    assert.doesNotMatch(main, /\shidden|<details|<iframe|<video/, route);
    for (const [, id] of main.matchAll(/<section class="category-section" id="([^"]+)" tabindex="-1"/g)) {
      assert.ok(main.includes(`href="#${id}"`), `${route}: missing section jump`);
      assert.ok(main.includes(`id="${id}-title"`), `${route}: missing accessible heading`);
    }
  }
  const solutionTitles = categoryContent.solutions.sections.map(section => section.title);
  const productTitles = categoryContent.product.sections.map(section => section.title);
  assert.equal(productTitles.some(title => solutionTitles.includes(title)), false);
  assert.match(html('/product/'), /aria-label="Proposed workflow"/);
  assert.match(html('/product/'), /Approval of an option would remain separate/);
  assert.match(html('/industries/'), /exploratory/);
  assert.doesNotMatch(html('/resources/'), /data-value-chain/);
});

function menuHarness() {
  const handlers = new Map();
  const listen = name => (type, fn) => handlers.set(`${name}:${type}`, fn);
  const summary = { focusCount: 0, focus() { this.focusCount++; } };
  const link = { addEventListener: listen('link') };
  const target = { focusOptions: null, focus(options) { this.focusOptions = options; } };
  const jump = { hash: '#workflow', addEventListener: listen('jump') };
  const menu = {
    open: false,
    querySelector: () => summary,
    querySelectorAll: () => [link],
    addEventListener: listen('menu'),
    contains: node => [link, summary].includes(node),
  };
  const document = {
    querySelector: selector => selector === 'details.mobile-menu' ? menu : null,
    querySelectorAll: selector => selector === '.on-page a, .skip-link' ? [jump] : [],
    getElementById: id => id === 'workflow' ? target : null,
    addEventListener: listen('document'),
  };
  const window = { matchMedia: () => ({ addEventListener: listen('media') }) };
  vm.runInNewContext(fs.readFileSync(new URL('../src/assets/app.js', import.meta.url), 'utf8'), { document, window });
  return { handlers, summary, link, target, menu };
}

test('mobile menu closes on escape, selection, outside focus/click, and desktop resize', () => {
  const { handlers, summary, link, menu } = menuHarness();
  menu.open = true;
  let prevented = false;
  handlers.get('menu:keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(menu.open, false);
  assert.equal(summary.focusCount, 1);
  assert.equal(prevented, true);
  menu.open = true;
  handlers.get('menu:focusout')({ relatedTarget: link });
  assert.equal(menu.open, true, 'Moving within the menu must not close it');
  handlers.get('menu:focusout')({ relatedTarget: {} });
  assert.equal(menu.open, false);
  for (const [handler, event] of [['link:click', {}], ['document:click', { target: {} }], ['media:change', { matches: true }]]) {
    menu.open = true;
    handlers.get(handler)(event);
    assert.equal(menu.open, false, handler);
  }
  assert.equal(summary.focusCount, 1, 'Only Escape should move focus to the toggle');
});

test('section links focus their target without replacing native URL or history navigation', () => {
  const { handlers, target } = menuHarness();
  handlers.get('jump:click')({ preventDefault() { throw new Error('Native navigation must not be cancelled'); } });
  assert.equal(target.focusOptions.preventScroll, true);
  const source = fs.readFileSync(new URL('../src/assets/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /pushState|replaceState|location\s*=/);
  const css = fs.readFileSync(new URL('../src/assets/styles.css', import.meta.url), 'utf8');
  assert.match(css, /html\s*\{\s*scroll-behavior:\s*auto/);
  assert.doesNotMatch(css, /min-width:\s*320px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
