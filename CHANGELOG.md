# Changelog

## 1.2.0 — 7 August 2026 — Private, contextual translation workspace

- Rebranded the extension as **Private Auto Page Translator** while keeping the existing Chrome Web Store identity and independent/unofficial disclaimer.
- Added a contextual translation engine that keeps inline sentence fragments together and safely falls back if a provider changes its internal boundary markers.
- Added translated, bilingual and original-on-hover reading modes that can be switched without another provider request.
- Added viewport-first translation so visible content is prioritized on long pages.
- Added a fail-closed Privacy Firewall that masks common private values and user-defined confidential terms before external-provider requests.
- Added Smart Compose for explicitly translating writing in supported editable fields, with preview, natural/formal/informal styles, copy, swap and confirm-before-replace controls.
- Added a persistent side-panel workspace for page controls, quick text translation, site intelligence, language-pack preparation and memory-only recent translations.
- Added per-site provider, target-language, reading-mode, automatic behaviour and sensitive-page settings.
- Added an on-device language-pack manager and download/readiness progress.
- Expanded localized core setup and navigation coverage from 6 to 20 language catalogs.
- Extended automated coverage for contextual boundaries, viewport priority, privacy-token integrity, site profiles, reading-mode reuse and Smart Compose non-replacement.

## 1.1.0 — Privacy, reliability and release hardening

- Made the Google web compatibility fallback opt-in instead of enabled by default.
- Added provider-specific text-route consent and enforced it in the translation pipeline.
- Added the documented DeepL API as an official provider option.
- Moved credentials to browser-session storage by default, with a separate remember-on-device choice.
- Moved site rules, language exclusions and terminology out of synchronized storage and added a versioned migration.
- Disabled rule persistence and automatic translation in private/incognito windows while retaining manual translation.
- Added a privacy dashboard, on-device availability reporting, credential-free settings backup and review-before-sharing support reports.
- Added exact-ZIP browser tests, large-page and accessibility regressions, package inspection, secret scanning, checksums, a CycloneDX dependency inventory and release provenance attestations.
- Added pinned GitHub Actions, Dependabot, CodeQL and nightly Chromium/Chrome/Brave compatibility checks.
- Added a protected Chrome Web Store V2 submission workflow that never skips review and blocks on warnings.
- Added a user-data map and synchronized policy, listing, security and support documentation.

## 1.0.0 — Initial public release

- Published [Auto Page Translator for Brave on the Chrome Web Store](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo) under extension ID `pilpighhgdglgngmakjepoadacbhpoeo`.
- Renamed the product to make its independent status clear.
- Added explicit first-run privacy consent and versioned consent records.
- Replaced permanent all-site access with manual `activeTab` access and optional automatic-site permissions.
- Added on-device, Google Cloud, LibreTranslate and Google web compatibility provider modes.
- Added provider throttling, retries, `Retry-After`, timeouts, cancellation, bounded cache and circuit breaking.
- Added incremental mutation processing, hidden-tab pausing and periodic open Shadow DOM discovery.
- Added password/payment-form safeguards and optional attribute translation.
- Added combined browser/page language detection, per-site target languages, glossary rules and protected terms.
- Added context-menu translation, selected-text translation and keyboard shortcuts.
- Added progress, cancellation, provider reporting, RTL handling and privacy-safe diagnostics.
- Added accessibility improvements, localisation scaffolding, browser E2E fixtures and store-submission documentation.

## 0.2.1

- Bound every queued translation callback to its original text node.
- Added a regression for the live removed/null-node failure.

## 0.2.0

- Rebuilt translation in place instead of navigating through a translated-page proxy.
- Added dynamic-content, frame, open Shadow DOM and restore-original support.

## 0.1.2 and earlier

- Initial Manifest V3 implementation and proxy-loop safeguards.
