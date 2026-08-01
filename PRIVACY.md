# Privacy Policy

Last updated: 1 August 2026

Brave Auto Page Translator is designed to keep its own data handling minimal and understandable.

## Information stored by the extension

The extension stores only the settings you choose:

- whether automatic translation is enabled;
- your target language;
- excluded language codes and website hostnames;
- whether dynamic text, the in-page restore control, and toolbar badges are enabled.

Settings use the browser's extension storage. If browser synchronization is enabled, the browser provider may synchronize them between your signed-in browser installations.

## Translation requests

When automatic or manual translation runs, readable text from the webpage is sent in small batches to Google's text-translation service and translated into your selected language. This processing is subject to Google's terms and privacy policy.

The extension does not intentionally include the page URL, cookies, browsing history, passwords, form entries, complete HTML, images, or files in translation requests. However, readable webpage text itself may contain personal, confidential, or sensitive information. Exclude sensitive websites or pause automatic translation if you do not want their visible text processed externally.

## Information not collected by the developer

The extension has no analytics, advertising, tracking pixels, telemetry, developer-operated server, or browsing-history database. The developer does not receive translation requests and does not sell personal data.

## Permissions

- `storage`: saves the settings described above.
- `tabs`: detects the current page language, identifies the active tab, and shows per-tab status.
- Access to `http://*/*` and `https://*/*`: allows automatic translation to read and replace webpage text while keeping the original site open. It also allows the background service to contact Google's HTTPS translation endpoints.

Browser-internal pages and extension pages remain inaccessible. The extension does not navigate translated tabs to a proxy website.

## Data retention

The extension keeps a temporary in-memory cache of translated text to reduce repeated requests during the current extension session. It is not written to disk and disappears when the browser discards or restarts the extension's background service. Original page text is retained only in the page's memory so it can be restored; it disappears when the tab navigates or closes.

## Changes and contact

Material changes will be documented in this repository. Questions and privacy concerns can be raised through the repository's GitHub Issues page:

https://github.com/Conroy1988/Brave-Auto-Page-Translator/issues
