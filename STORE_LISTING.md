# Chrome Web Store Listing

## Title

Private Auto Page Translator

## Published listing

- **Status:** Public
- **Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo)
- **Extension ID:** `pilpighhgdglgngmakjepoadacbhpoeo`
- **Source and development:** [GitHub](https://github.com/Conroy1988/Brave-Auto-Page-Translator)

The Chrome Web Store is the official distribution and automatic-update channel. This repository is the source and development home; the sections below are the canonical listing copy for the v1.2.0 update.

## Summary

Translate pages and writing with context, bilingual reading, on-device options and a Privacy Firewall.

## Single purpose

Translate readable webpage text and user-selected writing into a chosen language, on demand or automatically on websites the user authorizes.

## Description

Private Auto Page Translator is an independent, unofficial translation extension built for Brave and designed to work beautifully across Chrome and Chromium browsers.

Read foreign-language pages without leaving the original website. Context-aware translation keeps nearby words and inline elements together, viewport-first processing prioritizes what you can see, and three reading modes let you choose translated, bilingual or original-on-hover viewing.

Write across languages with Smart Compose. Preview a translation in a supported text editor, choose natural, formal or informal style, and replace your writing only when you explicitly confirm it.

Key features:

- Context-aware in-page translation for more coherent sentences
- Translated, bilingual and original-on-hover reading modes
- Viewport-first processing for long pages
- Privacy Firewall that masks common private values and your confidential terms before external requests
- Smart Compose with preview and confirm-before-replace controls
- Persistent side-panel translation workspace
- Per-site provider, target, reading mode and automation profiles
- On-device language-pack preparation where the browser supports it
- Live pages, open Shadow DOM and accessible-frame support
- Manual access by default; optional automation only where you allow it
- On-device, Google Cloud, DeepL API and LibreTranslate choices
- Explicit provider consent and session-only credentials by default
- Core setup and navigation labels localized across 20 languages
- No account, subscription, analytics, advertising or developer-operated translation server

External providers receive readable page text or writing only when required to return a translation. With Privacy Firewall enabled, recognized emails, URLs, phone numbers, IP addresses, dates, monetary amounts, reference identifiers and user-defined confidential terms are masked before the request. The extension fails closed if a provider damages a protection token.

This extension is not developed, sponsored or endorsed by Brave Software or Google. Brave includes native Translate; this extension provides a separate contextual, privacy-first and rule-driven workflow.

## Permission justifications

- **activeTab:** grants temporary current-page access after an extension click, context-menu command or keyboard shortcut.
- **scripting:** injects the packaged in-page translator into a webpage the user has permitted.
- **storage:** stores preferences, consent records, local-only site/glossary/privacy rules and provider credentials that remain session-only unless the user explicitly remembers them on the device.
- **contextMenus:** provides page, original-text, selected-text and explicit writing-translation commands.
- **offscreen:** provides a document context for the browser's on-device Translator API where supported.
- **sidePanel:** opens the persistent translation workspace containing current-page controls, quick text translation, site settings and language-pack preparation.
- **Optional HTTP/HTTPS website access:** requested from a user gesture only for an external translation provider, approved-site automation, all-site automation or user-supplied provider endpoint selected by the user. The extension has no permanent website access at installation.

## Data disclosure

**Clarification for the public “Authentication information” label:** this category applies only because users may optionally enter their own translation-provider API key. The extension never reads or collects website passwords, PINs, security answers, login form values or payment-card details.

- **Website content:** readable page text and explicitly submitted writing are handled solely to return translations. External transmission goes directly to the provider selected by the user; recognized private values are masked first when Privacy Firewall is enabled.
- **Browsing activity:** the current hostname is processed locally for site rules and is not retained as browsing history.
- **Settings:** ordinary settings are stored through browser extension storage; site profiles, glossary rules and confidential terms stay local to the device.
- **Provider credentials:** optional user-supplied translation API keys are stored in browser-session storage by default, optionally remembered locally after an explicit choice, sent only to the selected provider and never intentionally synchronized.
- **Recent translations:** a limited side-panel history exists only in extension memory for the current browser session and is not persisted.

The engineering-to-dashboard mapping is maintained in [DATA_MAP.md](DATA_MAP.md). The Chrome Web Store Privacy Practices form must declare website content and authentication information consistently with that map.

Remote code declaration: **No.** All executable code is packaged in the extension. Provider responses are handled only as translated text.

## Support URL

https://github.com/Conroy1988/Brave-Auto-Page-Translator/issues

## Homepage

https://github.com/Conroy1988/Brave-Auto-Page-Translator

## Privacy policy

https://github.com/Conroy1988/Brave-Auto-Page-Translator/blob/main/PRIVACY.md
