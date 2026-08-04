# Changelog

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
