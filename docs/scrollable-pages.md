# Scrollable-page contract

The six primary links open Solutions, Platform, Technology, Industries, Resources, and Company directly. Their URLs remain `/solutions/`, `/product/`, `/capabilities/`, `/industries/`, `/resources/`, and `/company/`.

Each short page has one introduction and visible sections, without a duplicate “On this page” shortcut row. Solutions covers business needs; Platform describes a proposed user workflow; Technology explains methods. Industry expansion is explicitly exploratory. Company combines purpose, co-founders, and contact. Resources links to three separate cases: an interactive equipment case, a short manufacturing case, and the cleared WBG research summary. The longer equipment case retains its section shortcuts. Controls and IDs remain page-specific.

## Migration

`config/route-migration.json` preserves the reviewed baseline page list, prior redirects, and retired-page map. Together these produce 39 direct mappings and 78 exact slash/non-slash rules. Retired pages are absent from output and the sitemap. Permanent redirect destinations are restricted to an allowlisted path and optional simple fragment; the build rejects missing or duplicate target IDs, malformed destinations, and application paths.

Redirect destinations with explicit fragments replace an incoming old fragment, including the former child-page `#summary-title`. The destination is the mapped section, not a promise to retain every historical heading position. Check this behavior in the hosting emulator and a browser.

## Interaction and accessibility

- Native links preserve browser history and work without scripting.
- Section IDs and focusable targets remain for existing bookmarks and redirects. Skip links move keyboard focus to main content without cancelling native fragment navigation.
- The native mobile disclosure works without scripting. Enhancement closes it on selection, Escape, outside focus/click, and a switch to desktop width. Escape returns focus to its summary.
- Only the global header is sticky. Section scroll margins clear it; no sticky local bar or forced scrolling is added.
- Layouts are single-column on narrow screens. Category main content stays below 250 words. Short case summaries have three sections; the equipment case retains its interactive detail.

## Verification and release

Run the marketing, category, composition, public-source, and loopback HTTP checks under the pinned runtime. Browser review must cover desktop and 320/390-pixel mobile widths, native menu keyboard behavior, direct section entry/reload, old bookmarks, history navigation, the equipment controls, and both static summaries. Automated assertions do not substitute for rendered checks.

Preserve the hash-pinned application, exact routing boundaries, and approved contact destination. A navigation redesign does not verify the backend or authorize new application features, access, DNS, or research publication. Deploy only the reviewed combined artifact. Retain the previous successful deployment and verify it immediately before upload. Permanent redirects may be cached by browsers even after a server rollback.
