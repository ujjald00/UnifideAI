# Preserved public application

`baseline/index.html` and `baseline/assets/index-Dn-nqYxi.js` are byte-preserved public files from deployment `11c6d416-bdae-4ae2-b092-5f9ba94c1d69`; their SHA-256 values are pinned in `config/legacy-app.json`. This is a recovery artifact, not recovered original application source. Do not rebuild or edit the minified bundle.

Composition emits the unchanged bundle at its original `/assets/` URL and generates `/__app/index.html` from the baseline HTML. The wrapper differs only by a single external `root-navigation.js` script inserted before the existing module script. The bridge performs full navigation when ordinary home-link clicks, `pushState`, `replaceState`, or back/forward navigation cross into the same-origin marketing root. Other routes retain native history behavior. Requests, forms, authentication, and API behavior are not intercepted or repaired.

Only `/dashboard`, `/demo`, `/login`, and `/jobs/:id` receive the app wrapper. Trailing slash forms redirect to these canonical app routes. Rewrites use `/__app/`, not `/__app/index.html`, to avoid Cloudflare's index-file canonicalization redirect. Direct requests for `/__app`, `/__app/`, and `/__app/index.html` redirect to `/dashboard`; internal app rewrites still serve the wrapper. The recovered client router has no job-child routes, so those paths are not given a fallback. The baseline global `/* /index.html 200` rule is deliberately not retained. Unknown marketing routes use the marketing 404; `/api` is never rewritten or proxied. Explicit app headers add `noindex` and disable browser caching of bootstrap pages, without applying the marketing Content Security Policy to the app.

The six old homepage images, including profile portraits, are omitted from both this source package and the public release. Their references are in old homepage components, not the app-route views. The private eight-file recovery snapshot remains under `UNIFIDE Inventory/deployments/2026-10-22-website-refresh/baseline-11c6d416/` for rollback. The new marketing build must not contain old profile references.

## Known production limitation

The preserved app uses same-origin `/api` calls. The observed current deployment has a global HTML fallback and API HEAD checks return HTML. Backend functionality is unverified; no API response bodies were accessed. This composition neither invents nor repairs a backend and must not be presented as a working end-to-end product deployment. Explicit acceptance of this limitation is a separate production gate owned by the release owner.

## Checks

After the marketing build, run `node scripts/compose-release.mjs`, then `node scripts/verify-composition.mjs`. The composer verifies source hashes, source/build manifests, collisions, routing boundaries, and header scope before replacing generated output. It refuses to overwrite an untracked or modified existing `dist/`. Its generated state is `artifacts/composition-state.json` and is not published.

The app routing contract was checked against the local Cloudflare runtime: the four app routes serve the exact wrapper, slash forms and direct shell aliases redirect correctly, and unsupported child paths return 404. Exact redirect rules precede parameter rules to avoid Wrangler ordering diagnostics. Bridge tests cover root link clicks, programmatic push/replace navigation, and back/forward transitions, while preserving ordinary app history calls. Local runtime checks do not establish production backend functionality.
