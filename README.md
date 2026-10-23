# UNIFIDE marketing release

Curated, dependency-free static marketing source. This directory is separate from the preserved local prototype. It contains two approved case examples, the cleared short WBG research summary, and public marketing copy. No research reports, private source notes, customer datasets, or prior hosting identity are imported.

## Build and check

Use Node **24.19.0** (pinned in `.node-version`). There are no runtime or build dependencies to install.

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
node scripts/build.mjs --production
node scripts/compose-release.mjs
node scripts/verify-composition.mjs
node scripts/verify-public-source.mjs
```

The default build is non-indexable preview output. Production builds require an approved contact URL in `config/release.json`. The approved link opens an email application; this site does not submit or store a form, and it does not claim that email was sent.

`marketing-dist/` is generated, never a source directory. The generator owns it and refuses to replace an output tree containing unexpected or edited files. `marketing-build-state.json` records the exact generated files and hashes outside the public output. Builds are reproducible and do not need a previous output tree.

## Public scope and routes

`config/routes.json` is the complete marketing route allowlist, plus exact legacy redirects. The site has 13 canonical marketing pages: six scrollable categories, three cases, the homepage, Security & Trust, the diagnostic page, and Privacy. Navigation links open categories directly. Short pages omit duplicate section-shortcut rows; section bookmarks still work. The mobile menu uses a native disclosure and works without JavaScript.

Category copy lives in `src/category-content.mjs`; `src/content.json` contains the three case records. Shared markup lives in `src/render.mjs`. All three cases use short static summaries. Equipment and manufacturing each cover problem, approach, and value; WBG covers its research problem, value chain, and outcomes. Earlier model data remains in source, but detailed controls and metrics are not rendered. The full WBG report and detailed research module remain excluded. `config/route-migration.json` records all 16 retired pages and the 23 previous redirects. Every one points directly to a retained page or a validated section ID; no broad SPA fallback is generated. See [Scrollable-page contract](docs/scrollable-pages.md).

Unverified affiliations are not presented. Platform copy describes a proposed workspace; Security & Trust retains its specific design-principles notice. Neither claims certifications or deployed controls.

Static assets use content-hashed filenames under `/_marketing/`. This avoids the application's asset namespace. `_headers` is scoped to marketing paths and assets rather than to the entire domain. A strict self-hosted CSP is supported without inline scripts or style attributes. Hostname aliases, TLS and existing application policies remain separate deployment concerns.

## Application composition

The marketing build alone does **not** contain the application. The separate composition step adds hash-pinned public application files from the baseline deployment. See `legacy-app/README.md` and `config/legacy-app.json` for the exact boundary. Publish only the verified combined `dist/`, never `marketing-dist/` as a whole-domain replacement.

The original application bundle is unchanged. Its backend remains unverified: the baseline's same-origin API path returned an HTML content type to a HEAD request. This release neither adds nor repairs that backend. Preserving frontend bytes is not an end-to-end product certification.

The application `/dashboard`, `/login`, `/demo`, `/jobs`, `/api`, and `/assets` families are not rewritten by marketing. Search directives are not access control. Preview robots settings must not overwrite production application configuration accidentally.

## Verification and release handoff

Tests cover clean-output reproducibility, route ownership, package allowlisting, internal links and anchors, metadata, concise case summaries and retained source-data bounds, approved mailto behavior, strict CSP compatibility, and preservation of the source tree. Browser testing and the application integration check are additional release gates, not substitutes for these tests.

No Git repository, remote, credential, deployment target, or production release is created by these scripts. The included GitHub workflow runs checks with read-only permissions and has no deployment credentials. See [Release procedure](docs/release.md). Keep the last known-good full-site artifact and routing configuration for rollback.
