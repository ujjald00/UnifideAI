# Release procedure

## Boundaries

This source prepares a minimal marketing site plus a preserved public application bundle for the existing Cloudflare Pages project `unifideai`. It does not configure accounts, authentication, an API, email delivery, DNS, or billing. There is no automatic deployment pipeline. The GitHub check workflow has read-only access and no production secrets.

Use Node 24.19.0. The website has no package dependencies. For local Cloudflare serving and an approved Direct Upload, use Wrangler 4.152.0 with its supported Node runtime. Never accept a temporary-account shortcut as the production destination.

## Verification

1. Run `node scripts/verify-public-source.mjs`, then `npm run check`.
2. Run `npm run build:production`, `node scripts/compose-release.mjs`, and `node scripts/verify-composition.mjs`.
3. Serve **dist**, not marketing-dist, using the pinned Wrangler: `wrangler pages dev dist --ip 127.0.0.1 --port 4175`.
4. Run `npm run test:http`. Review the server log for rejected redirect/header rules.
5. Test desktop/mobile navigation, keyboard controls, both case studies, email-link destinations, and app entry/deep links. Do not submit production scenarios, upload data, or access business API records as a website test.
6. Review the exact source diff and run `node scripts/verify-public-source.mjs --staged` before committing. This scan complements, not replaces, manual permission and content review.
7. Record the source commit, exact file inventory and artifact hash from `artifacts/composition-state.json`, test results, and screenshots in a private release record. Do not publish local evidence notes or credentials.

## Publication gates

- Confirm the repository owner and visibility before sending source. Publish only this curated project, never a parent workspace or the original research prototype.
- Obtain approval for the exact two-case public copy and deployment artifact. Held research remains excluded from source and web output.
- Explicitly disclose and accept the preserved application's unverified backend. Frontend smoke checks cannot establish product functionality.
- Confirm the existing Pages project and rollback deployment immediately before upload. Do not substitute a newly built artifact after approval without rechecking its hash.
- Use existing approved access. Creating OAuth access, API tokens, permissions, or domain changes requires separate authorization. Do not store credentials in this repository.
- Any preview upload is an external publication. Use a preview-mode build, record its differing robots policy/hash, and approve the exact destination and contents first. `noindex` is not access control.

## Production and recovery

Use the established Direct Upload process for the existing Pages project only after approval. Record the returned deployment ID and verify its status before retrying any uncertain result. Check actual production HTML, navigation, redirects, 404s, static asset hashes, contact links, and permitted non-mutating app checks. Do not claim success solely because upload completed.

Record the currently successful production deployment immediately before upload and confirm it is available for rollback. Do not use an older deployment ID from a historical note without checking it. The private recovery snapshot preserves the previous combined artifact and its checksums; this public repository intentionally does not include old portrait files.

If this release causes missing app assets, broken entry routes, widespread marketing failures, or unintended disclosure, stop changes and request/execute the authorized rollback to the recorded successful production deployment. Verify the homepage, app bootstrap/bundle hashes, known routes and headers afterward. A deployment rollback does not undo DNS, credentials, permissions, or external services; those are deliberately outside this release.

After launch, record unresolved baseline issues separately from regressions. Schedule a later check only if requested; a local checklist is not a scheduled monitor.
