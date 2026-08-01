# Privacy Policy

Last updated: 1 August 2026

Auto Page Translator for Brave is an independent browser extension. It is not developed, sponsored, or endorsed by Brave Software or Google.

## Plain-language summary

- Translation is blocked until you accept the in-extension privacy disclosure.
- Manual mode is the default and uses temporary access to the page you choose.
- Automatic modes request access only to approved websites or, if you explicitly choose it, all HTTP and HTTPS websites.
- An external translation provider receives readable page text only when translation runs.
- The developer does not receive webpage text and operates no translation relay or analytics server.
- The extension does not sell data, show ads, create behavioural profiles, or maintain browsing history.

## Information stored by the extension

The extension stores the settings you choose, including:

- whether automatic translation is enabled and which access mode is selected;
- target language, provider choice, site/language exclusions, approved sites and per-site targets;
- glossary and never-translate terms;
- live-page, attribute, sensitive-form, direction, page-control and badge preferences;
- the accepted privacy-disclosure version and acceptance time.

Ordinary settings use the browser's synchronized extension storage. If browser synchronization is enabled, the browser provider may synchronize those settings between signed-in browser installations.

Provider secrets—Google Cloud API keys, LibreTranslate endpoint details and LibreTranslate API keys—use local extension storage and are not intentionally synchronized by this extension.

## Website content and translation requests

When translation runs, the extension selects readable text nodes from the webpage. If the chosen translation engine is external, that text is sent in small batches over HTTPS to the provider and translated into the selected target language.

Readable page text may include personal, confidential, financial, health-related, account-specific, user-generated or communication content displayed by the site. Automatic translation is therefore paused by default on pages containing password or payment fields. Users can exclude any site or choose manual-only access.

The extension does not intentionally include page URLs, cookies, passwords, authentication tokens, editable form entries, complete HTML, images, video, files or text rendered only inside canvas elements. Accessibility-attribute translation is disabled by default because labels and alternative text may contain account-specific information.

## Translation providers

The provider selected in Settings determines where text is processed:

- **Browser on-device translator:** text is processed by the browser's built-in Translator API where supported. Required language models may be downloaded by the browser.
- **Google Cloud Translation:** text is sent directly to Google Cloud Translation using the API key supplied by the user. The user's Google Cloud terms, billing, quota and data-processing terms apply.
- **LibreTranslate:** text is sent directly to the HTTPS endpoint supplied by the user. The operator of that server controls its logging and retention practices.
- **Google web compatibility service:** text is sent directly to Google's web translation service. This compatibility method is not the authenticated Google Cloud Translation API and has no published production availability guarantee.

Automatic provider selection tries the on-device provider first, configured supported/custom providers next, and the Google web compatibility service only when its fallback setting is enabled.

Provider terms and privacy practices are independent of the extension. Users should review the terms for the provider they choose.

## Information not collected by the developer

The extension contains no analytics, advertising, tracking pixels, affiliate code, telemetry, developer-operated translation server, user account system or browsing-history database. The developer does not receive translation requests or provider credentials and does not sell personal data.

## Permissions

- `activeTab`: grants temporary access to the current page after an explicit extension click, context-menu action or keyboard shortcut.
- `scripting`: injects the packaged in-page translator into a permitted webpage. No remotely hosted code is executed.
- `storage`: stores the settings and local provider credentials described above.
- `contextMenus`: provides Translate page, Show original and Translate selected text commands.
- `offscreen`: provides a document context for the browser's on-device Translator API when supported.
- Optional access to HTTP and HTTPS websites: requested only for the external translation provider, approved-site automation, all-site automation or user-supplied provider endpoint selected by the user. The extension has no permanent website access at installation.

Browser-internal pages and other protected surfaces remain inaccessible.

## Data retention and deletion

The extension keeps a bounded in-memory translation cache to reduce repeated requests. It is not written to disk and can be cleared from Settings. It disappears when the background extension process is discarded or restarted.

Original page text is retained only in the page's memory so it can be restored. It disappears when the tab navigates or closes.

Settings can be reset from the extension's control centre. Removing the extension deletes its extension storage under the browser's normal extension-removal process. External providers control their own server-side logging and retention.

## Chrome Web Store Limited Use disclosure

The extension's use and transfer of user data is limited to providing and improving its single purpose: translating webpage text chosen or authorized by the user. Data is not used or transferred for advertising, profiling, creditworthiness, unrelated analytics or sale. The developer does not permit humans to read webpage text handled by the extension. Transfers to a chosen translation provider occur only as necessary to return the requested translation.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Security

Page text and provider requests use HTTPS, except that a user may deliberately configure a LibreTranslate server running locally on `localhost` or `127.0.0.1`. Provider credentials are omitted from diagnostics and are never written to logs by the extension.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Changes and contact

Material changes will be documented in this repository and may require renewed in-extension consent. Privacy questions can be raised through the project's [GitHub Issues](https://github.com/Conroy1988/Brave-Auto-Page-Translator/issues) page. Do not include private webpage text, API keys or account information in an issue.
