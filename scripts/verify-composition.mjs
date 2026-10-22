import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { appWrapper, composeRelease, filesIn, matches, parseHeaders, parseRedirects, projectRoot, sameFiles, sha256, validateMarketingRouting } from './compose-release.mjs';

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const bundle = 'assets/index-Dn-nqYxi.js';
const originalHashes = {
  'index.html': '80aafb4e2ed0dc981a0b3ce1a3d48f72e77589b3dbbb710dd310cb281b8f7f6a',
  [bundle]: '11e1e7b79d2947dd153b90acb35662bf8cbc4f26aae80d69f25f1470738dcf13',
};
const expectedRewrites = ['/dashboard', '/demo', '/login', '/jobs/:id'];
const expectedNormalizations = { '/dashboard/': '/dashboard', '/demo/': '/demo', '/login/': '/login', '/jobs/:id/': '/jobs/:id' };
const expectedShellRedirects = { '/__app': '/dashboard', '/__app/': '/dashboard', '/__app/index.html': '/dashboard' };
const appProbes = ['/dashboard', '/dashboard/', '/demo', '/demo/', '/login', '/login/', '/jobs/example', '/jobs/example/', '/__app', '/__app/', '/__app/index.html', '/__app/root-navigation.js'];
const excludedProbes = ['/api', '/api/', '/api/jobs', '/api/files/upload', '/api/chat/message', '/api/tenants/me/data/init', '/unknown-marketing-page', '/jobs', '/jobs/', '/jobs/example/child', '/jobs/example/nested/child', '/dashboard/not-a-route'];

export function verifyComposition(root = projectRoot) {
  const config = readJSON(path.join(root, 'config/legacy-app.json'));
  const state = readJSON(path.join(root, 'artifacts/composition-state.json'));
  const marketingState = readJSON(path.join(root, 'marketing-build-state.json'));
  const output = path.join(root, 'dist');
  const actual = filesIn(output);
  const marketing = filesIn(path.join(root, 'marketing-dist'));
  sameFiles(actual, state.files, 'Composed release');
  sameFiles(marketing, marketingState.files, 'Marketing build');
  assert.equal(state.artifactHash, sha256(JSON.stringify(actual)), 'Composed artifact hash');
  assert.equal(state.marketingArtifactHash, marketingState.artifactHash, 'Marketing provenance');
  assert.equal(state.mode, marketingState.mode, 'Build mode');
  assert.deepEqual(Object.keys(actual).sort(), [...Object.keys(marketing), bundle, config.appEntry, config.bridgeOutput].sort(), 'Only the wrapper, bridge, and original bundle may be added');
  assert.ok(actual['404.html'], 'A real marketing 404 must be present');
  for (const [file, hash] of Object.entries(marketing)) {
    if (!['_headers', '_redirects'].includes(file)) assert.equal(actual[file], hash, `Marketing changed: ${file}`);
  }
  sameFiles(filesIn(path.join(root, config.baselineDirectory)), originalHashes, 'Pinned public app baseline');
  assert.equal(actual[bundle], originalHashes[bundle], 'Public application bundle changed');
  assert.equal(state.originalBootstrapHash, originalHashes['index.html']);
  const baselineHTML = fs.readFileSync(path.join(root, config.baselineDirectory, 'index.html'), 'utf8');
  const wrapper = appWrapper(baselineHTML, config.bridgeOutput);
  const composedHTML = fs.readFileSync(path.join(output, config.appEntry), 'utf8');
  assert.equal(composedHTML, wrapper.html, 'Wrapper must differ only by the single bridge insertion');
  assert.equal(composedHTML.split(wrapper.addition).length, 2, 'Exactly one bridge script');
  assert.equal(composedHTML.replace(wrapper.addition, ''), baselineHTML);
  assert.equal(actual[config.bridgeOutput], sha256(fs.readFileSync(path.join(root, config.bridgeSource))));
  assert.equal(state.wrapperHash, actual[config.appEntry]);
  assert.equal(state.bridgeHash, actual[config.bridgeOutput]);
  for (const file of config.omittedAssets) assert.equal(actual[file], undefined, `Old marketing image present: ${file}`);
  assert.equal(state.backendStatus, config.backendStatus);
  assert.equal(state.productionGate, config.productionGate);

  const marketingRedirectText = fs.readFileSync(path.join(root, 'marketing-dist/_redirects'), 'utf8');
  const marketingHeaderText = fs.readFileSync(path.join(root, 'marketing-dist/_headers'), 'utf8');
  validateMarketingRouting(marketingRedirectText, marketingHeaderText);
  const redirects = parseRedirects(fs.readFileSync(path.join(output, '_redirects'), 'utf8'));
  const marketingRedirects = parseRedirects(marketingRedirectText);
  assert.deepEqual(redirects.slice(0, marketingRedirects.length), marketingRedirects, 'Marketing redirects changed');
  const appRedirects = redirects.slice(marketingRedirects.length);
  assert.equal(config.rewriteTarget, '/__app/', 'Use the canonical folder path to avoid an index.html redirect');
  const expectedAppRules = [
    ...Object.entries(expectedNormalizations).map(([source, destination]) => ({ source, destination, status: 301 })),
    ...Object.entries(expectedShellRedirects).map(([source, destination]) => ({ source, destination, status: 301 })),
    ...expectedRewrites.map(source => ({ source, destination: config.rewriteTarget, status: 200 })),
  ];
  assert.deepEqual(appRedirects, [...expectedAppRules.filter(rule => !rule.source.includes(':')), ...expectedAppRules.filter(rule => rule.source.includes(':'))], 'Only explicit app normalizations, shell redirects, and rewrites may be appended, with exact rules first');
  const firstDynamicRule = redirects.findIndex(rule => /[:*]/.test(rule.source));
  if (firstDynamicRule !== -1) assert.ok(redirects.slice(firstDynamicRule).every(rule => /[:*]/.test(rule.source)), 'Exact routes must precede all parameterized rules');
  assert.equal(new Set(redirects.map(rule => rule.source)).size, redirects.length, 'Duplicate redirect');
  for (const route of appProbes.filter(route => route !== '/__app' && !route.startsWith('/__app/'))) {
    assert.ok(appRedirects.some(rule => matches(rule.source, route)), `App route not preserved: ${route}`);
  }
  for (const route of excludedProbes) assert.ok(!redirects.some(rule => matches(rule.source, route)), `Unexpected fallback: ${route}`);
  assert.ok(!redirects.some(rule => rule.source === '/*'), 'Global SPA fallback forbidden');

  const headers = parseHeaders(fs.readFileSync(path.join(output, '_headers'), 'utf8'));
  const marketingHeaders = parseHeaders(marketingHeaderText);
  assert.deepEqual(headers.slice(0, marketingHeaders.length), marketingHeaders, 'Marketing headers changed');
  const appHeaders = headers.slice(marketingHeaders.length);
  assert.deepEqual(appHeaders, [...expectedRewrites, ...Object.keys(expectedNormalizations), ...Object.keys(expectedShellRedirects), `/${config.bridgeOutput}`].map(pattern => ({ pattern, headers: ['X-Robots-Tag: noindex', 'Cache-Control: no-store'] })), 'App header additions must remain narrow');
  for (const route of appProbes) {
    const applied = headers.filter(block => matches(block.pattern, route)).flatMap(block => block.headers);
    assert.ok(!applied.some(header => /^Content-Security-Policy\s*:/i.test(header)), `Marketing CSP leaked onto ${route}`);
    assert.ok(applied.includes('X-Robots-Tag: noindex'), `Missing app noindex: ${route}`);
    assert.ok(applied.includes('Cache-Control: no-store'), `Missing app bootstrap no-store: ${route}`);
  }
  for (const route of excludedProbes.filter(route => route.startsWith('/api'))) {
    assert.ok(!appHeaders.some(block => matches(block.pattern, route)), `App headers changed API behavior: ${route}`);
  }
  return { files: Object.keys(actual).length, mode: state.mode, artifactHash: state.artifactHash };
}

function checkBridge() {
  const code = fs.readFileSync(path.join(projectRoot, 'legacy-app/root-navigation.js'), 'utf8');
  let listener;
  let popstateListener;
  const navigations = [];
  const replacements = [];
  const historyCalls = [];
  const nativeHistory = method => function (...args) {
    if (args[2] !== undefined && args[2] !== null && new URL(args[2], context.window.location.href).origin !== context.window.location.origin) throw new Error('Native cross-origin history error');
    historyCalls.push({ method, args, receiver: this });
    return `${method}-result`;
  };
  const context = {
    URL,
    document: { addEventListener(type, callback, capture) { assert.equal(type, 'click'); assert.equal(capture, true); assert.equal(listener, undefined); listener = callback; } },
    window: {
      location: { href: 'https://example.test/dashboard', origin: 'https://example.test', assign: url => navigations.push(url), replace: url => replacements.push(url) },
      history: { pushState: nativeHistory('pushState'), replaceState: nativeHistory('replaceState') },
      addEventListener(type, callback, capture) { assert.equal(type, 'popstate'); assert.equal(capture, true); assert.equal(popstateListener, undefined); popstateListener = callback; },
    },
  };
  vm.runInNewContext(code, context, { timeout: 1000 });
  function click(href, options = {}) {
    const before = navigations.length;
    let prevented = 0;
    let stopped = 0;
    const anchor = { href, target: options.target || '', hasAttribute: name => name === 'download' && !!options.download };
    const event = {
      button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      target: { closest: selector => { assert.equal(selector, 'a[href]'); return options.noAnchor ? null : anchor; } },
      preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; }, ...options.event,
    };
    listener(event);
    return { navigated: navigations.length - before, prevented, stopped };
  }
  const intercepted = { navigated: 1, prevented: 1, stopped: 1 };
  const untouched = { navigated: 0, prevented: 0, stopped: 0 };
  assert.deepEqual(click('https://example.test/'), intercepted);
  assert.deepEqual(click('https://example.test/?from=app#home', { target: '_self' }), intercepted);
  assert.equal(navigations.at(-1), 'https://example.test/?from=app#home');
  for (const href of ['https://example.test/dashboard', 'https://example.test/login', 'https://example.test/api/jobs', 'https://outside.test/', 'mailto:test@example.test', 'not a URL']) assert.deepEqual(click(href), untouched, href);
  for (const options of [{ download: true }, { target: '_blank' }, { noAnchor: true }, { event: { button: 1 } }, { event: { button: 2 } }, { event: { defaultPrevented: true } }, ...['metaKey', 'ctrlKey', 'shiftKey', 'altKey'].map(key => ({ event: { [key]: true } }))]) assert.deepEqual(click('https://example.test/', options), untouched);
  assert.deepEqual(click('https://example.test/', { event: { target: null } }), untouched);
  const navigationCount = navigations.length;
  context.window.history.pushState({ root: true }, '', '/?from=app#home');
  assert.equal(navigations.length, navigationCount + 1);
  assert.equal(navigations.at(-1), 'https://example.test/?from=app#home');
  context.window.history.replaceState({ root: true }, '', 'https://example.test/');
  assert.deepEqual(replacements, ['https://example.test/']);
  assert.equal(historyCalls.length, 0, 'Root crossings must not render the old SPA homepage');
  for (const method of ['pushState', 'replaceState']) {
    for (const route of ['/dashboard', '/demo', '/login', '/jobs/example', '/api/jobs', '?view=calendar', '#details', '', undefined, null]) {
      const state = { preserve: true };
      assert.equal(context.window.history[method](state, 'title', route), `${method}-result`);
      assert.equal(historyCalls.at(-1).method, method);
      assert.equal(historyCalls.at(-1).args[0], state);
      assert.equal(historyCalls.at(-1).args[1], 'title');
      assert.equal(historyCalls.at(-1).args[2], route);
      assert.equal(historyCalls.at(-1).receiver, context.window.history);
    }
    assert.throws(() => context.window.history[method]({}, '', 'https://outside.test/'), /Native cross-origin history error/);
  }
  let stopped = 0;
  const replacementCount = replacements.length;
  popstateListener({ stopImmediatePropagation() { stopped++; } });
  assert.equal(stopped, 0, 'App popstate must propagate normally');
  assert.equal(replacements.length, replacementCount);
  context.window.location.href = 'https://example.test/?back=1#home';
  popstateListener({ stopImmediatePropagation() { stopped++; } });
  assert.equal(stopped, 1, 'Root popstate must not reach the old SPA router');
  assert.equal(replacements.at(-1), 'https://example.test/?back=1#home');
}

function writeFixture(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function updateFixtureMarketingState(root) {
  const files = filesIn(path.join(root, 'marketing-dist'));
  writeFixture(path.join(root, 'marketing-build-state.json'), JSON.stringify({ schemaVersion: 1, mode: 'preview', files, artifactHash: sha256(JSON.stringify(files)) }));
}

function createFixture(root) {
  for (const file of ['config/legacy-app.json', 'legacy-app/root-navigation.js', 'legacy-app/baseline/index.html', `legacy-app/baseline/${bundle}`]) writeFixture(path.join(root, file), fs.readFileSync(path.join(projectRoot, file)));
  writeFixture(path.join(root, 'marketing-dist/index.html'), '<!doctype html><title>Marketing</title>');
  writeFixture(path.join(root, 'marketing-dist/404.html'), '<!doctype html><title>Not found</title>');
  writeFixture(path.join(root, 'marketing-dist/_redirects'), '/old/ /new/ 301\n');
  writeFixture(path.join(root, 'marketing-dist/_headers'), '/\n  Content-Security-Policy: default-src \'self\'\n\n/_marketing/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  updateFixtureMarketingState(root);
}

export function runSelfTests() {
  let checks = 0;
  const check = (label, action) => { action(); checks++; console.log(`PASS ${label}`); };
  check('bridge protects root clicks and history crossings while preserving app routing', checkBridge);
  check('marketing routing rejects API redirects and broad app CSP', () => {
    for (const redirects of ['/* /index.html 200', '/api/jobs /new/ 301', '/old /api/jobs 301', '/dashboard /new/ 301', '/old /assets/bundle.js 301']) assert.throws(() => validateMarketingRouting(redirects, ''), /exact 3xx|reserved app path/);
    assert.throws(() => validateMarketingRouting('', "/*\n  Content-Security-Policy: default-src 'self'"), /CSP applies to app/);
    assert.throws(() => validateMarketingRouting('', "https://example.test/*\n  Content-Security-Policy: default-src 'self'"), /CSP applies to app/);
    assert.throws(() => validateMarketingRouting('', "/jobs/:id/child\n  Content-Security-Policy: default-src 'self'"), /CSP applies to app/);
    assert.throws(() => validateMarketingRouting('', "/assets/*\n  Content-Security-Policy: default-src 'self'"), /CSP applies to app/);
    assert.doesNotThrow(() => validateMarketingRouting('/old /new 301', "/\n  Content-Security-Policy: default-src 'self'"));
  });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'unifide-composition-test-'));
  try {
    const fixture = path.join(temporary, 'release');
    createFixture(fixture);
    check('composition preserves hashes, wrapper-only difference, routes, 404, and header scope', () => {
      composeRelease(fixture);
      assert.equal(verifyComposition(fixture).files, 7);
    });
    check('clean rebuild is deterministic and removes temporary build directories', () => {
      const previous = verifyComposition(fixture).artifactHash;
      composeRelease(fixture);
      assert.equal(verifyComposition(fixture).artifactHash, previous);
      assert.ok(!fs.readdirSync(fixture).some(file => file.startsWith('.compose-')));
      assert.deepEqual(fs.readdirSync(path.join(fixture, 'artifacts')), ['composition-state.json']);
    });
    check('modified generated output is preserved, not overwritten', () => {
      const extra = path.join(fixture, 'dist/user-file.txt');
      writeFixture(extra, 'Preserve this file');
      assert.throws(() => composeRelease(fixture), /Existing dist file hashes differ/);
      assert.equal(fs.readFileSync(extra, 'utf8'), 'Preserve this file');
      fs.unlinkSync(extra);
    });
    check('failed state installation restores the previous output and state', () => {
      const homepage = path.join(fixture, 'marketing-dist/index.html');
      const previousHomepage = fs.readFileSync(homepage);
      const statePath = fs.realpathSync(path.join(fixture, 'artifacts/composition-state.json'));
      const previousState = fs.readFileSync(statePath);
      const previousOutput = filesIn(path.join(fixture, 'dist'));
      fs.appendFileSync(homepage, 'A new build');
      updateFixtureMarketingState(fixture);
      const originalRename = fs.renameSync;
      try {
        fs.renameSync = (source, destination) => {
          if (destination === statePath) throw new Error('Simulated state installation failure');
          return originalRename(source, destination);
        };
        assert.throws(() => composeRelease(fixture), /Simulated state installation failure/);
      } finally {
        fs.renameSync = originalRename;
        fs.writeFileSync(homepage, previousHomepage);
        updateFixtureMarketingState(fixture);
      }
      sameFiles(filesIn(path.join(fixture, 'dist')), previousOutput, 'Restored output');
      assert.deepEqual(fs.readFileSync(statePath), previousState);
    });
    check('baseline modification is rejected before output changes', () => {
      const file = path.join(fixture, 'legacy-app/baseline', bundle);
      const original = fs.readFileSync(file);
      const before = filesIn(path.join(fixture, 'dist'));
      fs.appendFileSync(file, '\n');
      assert.throws(() => composeRelease(fixture), /Baseline hash mismatch/);
      sameFiles(filesIn(path.join(fixture, 'dist')), before, 'Failed baseline build');
      fs.writeFileSync(file, original);
    });
    check('marketing/app asset collisions are rejected', () => {
      const file = path.join(fixture, 'marketing-dist', bundle);
      writeFixture(file, 'Collision');
      updateFixtureMarketingState(fixture);
      assert.throws(() => composeRelease(fixture), /asset collision/);
      fs.unlinkSync(file);
      fs.rmdirSync(path.dirname(file));
      updateFixtureMarketingState(fixture);
    });
    check('build manifest mismatch is rejected', () => {
      const file = path.join(fixture, 'marketing-dist/index.html');
      const original = fs.readFileSync(file);
      fs.appendFileSync(file, 'unexpected change');
      assert.throws(() => composeRelease(fixture), /Marketing file hashes differ/);
      fs.writeFileSync(file, original);
    });
    check('source symlinks are rejected', () => {
      const file = path.join(fixture, 'legacy-app/root-navigation.js');
      const saved = path.join(fixture, 'legacy-app/saved-bridge.js');
      fs.renameSync(file, saved);
      fs.symlinkSync(saved, file);
      assert.throws(() => composeRelease(fixture), /Symlink rejected/);
      fs.unlinkSync(file);
      fs.renameSync(saved, file);
    });
    check('untracked existing dist is preserved', () => {
      const second = path.join(temporary, 'untracked-release');
      createFixture(second);
      writeFixture(path.join(second, 'dist/user-file.txt'), 'Do not replace');
      assert.throws(() => composeRelease(second), /Existing dist is untracked/);
      assert.equal(fs.readFileSync(path.join(second, 'dist/user-file.txt'), 'utf8'), 'Do not replace');
    });
    verifyComposition(fixture);
  } finally {
    fs.rmSync(temporary, { recursive: true });
  }
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checks = runSelfTests();
  if (!process.argv.includes('--self-test')) {
    const result = verifyComposition();
    console.log(`Verified ${result.files} composed files (${result.mode}); SHA-256 ${result.artifactHash}.`);
  }
  console.log(`${checks} composition self-tests passed. No production API requests were made; backend functionality is unverified.`);
}
