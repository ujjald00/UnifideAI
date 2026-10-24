# Scrollable-page contract

The six primary links open homepage sections: `/#solutions`, `/#platform`, `/#technology`, `/#industries`, `/#resources`, and `/#company`. They use the same native URLs on the homepage and detailed pages. Each homepage section provides its own direct detail link. The detailed URLs remain `/solutions/`, `/product/`, `/capabilities/`, `/industries/`, `/resources/`, and `/company/`.

## Continuous homepage

The hero states the offer, followed by six visible sections in navigation order. Solutions describes outcomes; Platform shows the proposed Evidence → Options → Human review workflow; Technology explains three methods. Industries makes the semiconductor focus and exploratory adjacent areas clear. Resources includes all three case studies and a link to the complete Insights archive. Company shares its founder records with the Company page.

Homepage copy is limited to 300–500 words, with three items in each applicable group. Editorial rows and a simple workflow use normal document scrolling; there are no carousels, full-screen snapping, copied article feeds, or new product claims. A faint CSS grid is limited to the hero. Primary actions appear in the shared header, hero, and closing Company area.

Each short page has one introduction and visible sections, without a duplicate “On this page” shortcut row. Solutions covers business needs; Platform describes a proposed user workflow; Technology explains methods. Industry expansion is explicitly exploratory. Company combines purpose, co-founders, and contact. Resources links to three short static cases: equipment, manufacturing, and the cleared WBG research summary. Each keeps its three section bookmarks without a shortcut row.

## Migration

`config/route-migration.json` preserves the reviewed baseline page list, prior redirects, and retired-page map. Together these produce 39 direct mappings and 78 exact slash/non-slash rules. Retired pages are absent from output and the sitemap. Permanent redirect destinations are restricted to an allowlisted path and optional simple fragment; the build rejects missing or duplicate target IDs, malformed destinations, and application paths.

Redirect destinations with explicit fragments replace an incoming old fragment, including the former child-page `#summary-title`. The destination is the mapped section, not a promise to retain every historical heading position. Check this behavior in the hosting emulator and a browser.

## Interaction and accessibility

- Native links preserve browser history and work without scripting.
- Section IDs and focusable targets remain for existing bookmarks and redirects. Skip links and same-page section links move keyboard focus to their targets without cancelling native fragment navigation. Modified clicks keep normal browser behavior. Cross-page section links do not focus an unrelated local element.
- On the homepage, passive, animation-frame-batched scroll observation highlights the current section with `aria-current="location"` in both navigation menus. It does not change the URL, create history entries, move focus, or control scrolling. History restoration, hash changes, resize, and the last section at the bottom of the document are covered. Detailed pages retain their category context without running a homepage observer.
- The native mobile disclosure works without scripting. Enhancement closes it on selection, Escape, outside focus/click, and a switch to desktop width. Escape returns focus to its summary.
- Only the global header is sticky. Section scroll margins clear it; no sticky local bar or forced scrolling is added.
- Layouts are single-column on narrow screens. Category main content stays below 250 words. All case summaries have three sections; equipment and manufacturing use one short paragraph per section.

## Verification and release

Run the marketing, category, composition, public-source, and loopback HTTP checks under the pinned runtime. Browser review must cover desktop and 320/390-pixel mobile widths, native menu keyboard behavior, direct section entry/reload, old bookmarks, history navigation, and all three static summaries. Automated assertions do not substitute for rendered checks.

Preserve the hash-pinned application, exact routing boundaries, and approved contact destination. A navigation redesign does not verify the backend or authorize new application features, access, DNS, or research publication. Deploy only the reviewed combined artifact. Retain the previous successful deployment and verify it immediately before upload. Permanent redirects may be cached by browsers even after a server rollback.
