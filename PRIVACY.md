# Privacy Policy

Last updated: 7 August 2026

Private Auto Page Translator is an independent browser extension. It is not developed, sponsored or endorsed by Brave Software or Google.

> **Important clarification:** the Chrome Web Store's broad “Authentication information” label refers only to optional translation-provider API keys entered by the user. The extension does not collect, store or transmit website passwords, passcodes, PINs, security answers, login form values or payment-card details.

## Plain-language summary

- Translation is blocked until you accept the in-extension privacy disclosure.
- Manual mode is the default and uses temporary access to the page you choose.
- Automatic modes request access only to approved websites or, if you explicitly choose it, all HTTP and HTTPS websites.
- An external translation provider receives readable page text only when translation runs.
- Smart Compose reads editable text only after the user explicitly clicks **Translate writing**, uses its context-menu command or presses `Alt+Enter`; login, password, passcode, PIN, one-time-code, security-code and payment fields are excluded.
- The Privacy Firewall masks common emails, phone numbers, URLs, IP addresses, references, dates and financial values before an external provider receives surrounding text. A damaged protection token makes the request fail closed.
- External providers and the Google web fallback are disabled until their specific data route is explicitly approved.
- Provider credentials remain in temporary browser-session storage by default.
- Automatic translation is disabled in private/incognito windows; manual translation remains available and private-window site rules are not saved.
- The developer does not receive webpage text and operates no translation relay or analytics server.
- The extension does not sell data, show ads, create behavioural profiles, or maintain browsing history.

## Information stored by the extension

The extension stores the settings you choose. Low-sensitivity preferences that can use browser synchronization include:

- whether automatic translation is enabled and which access mode is selected;
- target language and provider choice;
- live-page, attribute, sensitive-form, direction, reading-mode, viewport-priority, Smart Compose, Privacy Firewall, page-control and badge preferences;

If browser synchronization is enabled, the browser provider may synchronize those ordinary preferences between signed-in browser installations.

The following stay in local extension storage on the current device and are not intentionally synchronized by this extension:

- approved websites, excluded websites, per-site target-language rules and site-intelligence profiles;
- language exclusions, glossary entries, never-translate terms and additional user-defined Privacy Firewall values;
- privacy and provider-consent versions and acceptance times;
- the choice to remember provider credentials.

Provider secrets—Google Cloud API keys, LibreTranslate endpoint details and API keys, and DeepL API keys—are stored in temporary browser-session extension storage by default. They disappear after the browser fully closes. A user can explicitly choose **Remember provider credentials on this device**, which stores them in local extension storage. They are never intentionally synchronized by this extension and are excluded from settings backups and diagnostic reports.

## Website content and translation requests

When translation runs, the extension selects readable text nodes from the webpage. If the chosen translation engine is external, that text is sent in small batches over HTTPS to the provider and translated into the selected target language.

The contextual engine may combine text split across links, emphasis and other inline elements into a protected translation unit. It restores the result into the original DOM without sending full HTML. Viewport-first mode prioritizes visible units and processes the remainder while the page stays interactive. Bilingual and original-on-hover reading modes reuse the in-memory original and translated text; switching modes does not create another provider request.

Readable page text may include personal, confidential, financial, health-related, account-specific, user-generated or communication content displayed by the site. Automatic translation is therefore paused by default on pages containing password or payment fields. Users can exclude any site or choose manual-only access.

The extension does not intentionally include page URLs, cookies, passwords, authentication tokens, complete HTML, images, video, files or text rendered only inside canvas elements. Ordinary editable form entries are excluded from page translation. Smart Compose can translate text from a safe editable field only after the user explicitly requests it and confirms the preview before replacement. Login, password, passcode, PIN, one-time-code, security-code and payment fields are always ineligible. Accessibility-attribute translation is disabled by default because labels and alternative text may contain account-specific information.

The Privacy Firewall is an additional data-minimization layer, not a guarantee that every possible identifier can be recognized. Users should use on-device translation or avoid external providers for material that must never leave the browser.

## Translation providers

The provider selected in Settings determines where text is processed:

- **Browser on-device translator:** text is processed by the browser's built-in Translator API where supported. Required language models may be downloaded by the browser.
- **Google Cloud Translation:** text is sent directly to Google Cloud Translation using the API key supplied by the user. The user's Google Cloud terms, billing, quota and data-processing terms apply.
- **LibreTranslate:** text is sent directly to the HTTPS endpoint supplied by the user. The operator of that server controls its logging and retention practices.
- **DeepL API:** text is sent directly to DeepL's documented API using the API key supplied by the user. The user's DeepL terms, quota and data-processing terms apply.
- **Google web compatibility service:** text is sent directly to Google's web translation service. This compatibility method is not the authenticated Google Cloud Translation API and has no published production availability guarantee.

Automatic provider selection tries the on-device provider first, then only configured external providers whose specific disclosure has been accepted. The Google web compatibility service is off by default and is considered only when its separate fallback setting and provider consent are both enabled.

Provider terms and privacy practices are independent of the extension. Users should review the terms for the provider they choose.

## Information not collected by the developer

The extension contains no analytics, advertising, tracking pixels, affiliate code, telemetry, developer-operated translation server, user account system or browsing-history database. The developer does not receive translation requests or provider credentials and does not sell personal data.

## Permissions

- `activeTab`: grants temporary access to the current page after an explicit extension click, context-menu action or keyboard shortcut.
- `scripting`: injects the packaged in-page translator into a permitted webpage. No remotely hosted code is executed.
- `storage`: stores the settings and local provider credentials described above.
- `contextMenus`: provides Translate page, Show original, Translate selected text and explicit Translate writing commands.
- `offscreen`: provides a document context for the browser's on-device Translator API when supported.
- `sidePanel`: provides the persistent translation workspace, reading-mode controls, site profiles and browser-managed language-pack status.
- Optional access to HTTP and HTTPS websites: requested only for the external translation provider, approved-site automation, all-site automation or user-supplied provider endpoint selected by the user. The extension has no permanent website access at installation.

Browser-internal pages and other protected surfaces remain inaccessible.

## Data retention and deletion

The extension keeps a bounded in-memory translation cache to reduce repeated requests. It is not written to disk and can be cleared from Settings. It disappears when the background extension process is discarded or restarted.

The side-panel workspace keeps up to 20 recent selection, writing and workspace translations per tab in background memory. This history is not written to disk and ends when the background process restarts or the tab closes.

Original page text is retained only in the page's memory so it can be restored. It disappears when the tab navigates or closes.

Settings can be reset from the extension's control centre. Removing the extension deletes its extension storage under the browser's normal extension-removal process. External providers control their own server-side logging and retention.

Credential-free settings backups are created only after a user clicks Export. Confidential Privacy Firewall terms, provider credentials and consent records are excluded. Diagnostic reports are generated locally, shown for review and shared only when the user chooses to export or copy them. Neither artifact includes webpage text or page URLs.

## Chrome Web Store Limited Use disclosure

The extension's use and transfer of user data is limited to providing and improving its single purpose: translating webpage text chosen or authorized by the user. Data is not used or transferred for advertising, profiling, creditworthiness, unrelated analytics or sale. The developer does not permit humans to read webpage text handled by the extension. Transfers to a chosen translation provider occur only as necessary to return the requested translation.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Security

Page text and provider requests use HTTPS, except that a user may deliberately configure a LibreTranslate server running locally on `localhost` or `127.0.0.1`. Provider credentials are omitted from diagnostics, settings backups and logs. Extension storage is restricted to trusted extension contexts where the browser supports storage access levels.

The repository's [data map](DATA_MAP.md) records each data category, storage location, transmission path, retention rule and corresponding Chrome Web Store disclosure.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Changes and contact

Material changes will be documented in this repository and may require renewed in-extension consent. Privacy questions can be raised through the project's [GitHub Issues](https://github.com/Conroy1988/Brave-Auto-Page-Translator/issues) page. Do not include private webpage text, API keys or account information in an issue.
