# User Data Map and Chrome Web Store Disclosure Record

Last reviewed: 5 August 2026 for extension version 1.1.0.

This file is the engineering source of truth for the Chrome Web Store Privacy Practices form. Any change to data handling must update this map, `PRIVACY.md`, the in-product disclosure and the Web Store form before release.

| Data category | Why it is used | Stored by the extension | Transmitted | Retention and deletion | Web Store disclosure |
| --- | --- | --- | --- | --- | --- |
| Readable webpage text selected for translation | Return the translation requested or authorized by the user | Original text exists only in tab memory for restoration; a bounded translated-text cache exists only in background memory | To the browser on-device engine, or over HTTPS to an explicitly approved external provider | Tab data ends on navigation/close; cache ends on background restart or user clear | **Website content** — handled and transmitted for core functionality when an external provider is used |
| Current hostname | Match approved, excluded and per-site language rules | A hostname is stored only when the user explicitly creates a site rule; local storage only | Not sent to the developer or translation provider | Until the rule is removed, settings reset or extension uninstalled | Not collected as browsing history; explain local, user-created site rules in policy and listing |
| Target/provider/general behaviour preferences | Configure the single translation purpose | Browser synchronized extension storage | Browser sync may copy preferences between signed-in browser installations | Until changed, reset or extension uninstalled | Stored for app functionality; not sold or used for ads |
| Approved/excluded sites, per-site targets and language exclusions | Apply user-created translation rules | Local extension storage only | No | Until removed, reset or extension uninstalled | Describe as local app functionality; not browsing-history collection |
| Glossary and never-translate terms | Preserve user-selected terminology | Local extension storage only | Matching page text can be included in a translation request; the list is not separately uploaded | Until removed, reset or extension uninstalled | **Website content** can apply because terms may contain user content; disclose local storage and translation-purpose use |
| Privacy and provider consent records | Prove and enforce current disclosure choices | Local extension storage: version and timestamp only | No | Until extension data is removed; material policy changes require renewed consent | App functionality/security record |
| User-supplied Google Cloud, LibreTranslate and DeepL API credentials/endpoints | Authenticate directly to the translation provider selected by the user | Session storage by default; local device storage only after explicit opt-in; never sync | Directly to the corresponding translation provider as required for authentication | Session end by default; until cleared/reset/uninstall if remembered | **Authentication information** — this broad Store category refers only to optional provider API keys, never website passwords, PINs, security answers, login fields or payment details |
| Diagnostic environment and configuration counts | Help the user troubleshoot | Generated on demand in memory and previewed before sharing | Only if the user copies/exports and shares it | Ends with the extension page unless explicitly exported by user | App functionality/support; excludes URLs, page text and credentials |

## Prohibited uses

No category is sold or used for advertising, profiling, creditworthiness, personalized recommendations, unrelated analytics or human review by the developer. There is no developer-operated collection endpoint, user account, telemetry SDK or tracking pixel.

## Release check

- Verify the Web Store Privacy Practices selections match this table.
- Verify every external provider has a just-in-time named disclosure and explicit consent.
- Verify fallback providers remain off by default.
- Verify new settings are assigned deliberately to sync, local, session or memory storage.
- Verify diagnostics and backups contain no credentials, URLs or webpage text.
- Verify optional host permissions remain requested from a user gesture.
