# Chrome Web Store Listing

## Title

Auto Page Translator for Brave

## Published listing

- **Status:** Public
- **Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo)
- **Extension ID:** `pilpighhgdglgngmakjepoadacbhpoeo`
- **Source and development:** [GitHub](https://github.com/Conroy1988/Brave-Auto-Page-Translator)

The Chrome Web Store is the official distribution and automatic-update channel. This repository is the source and development home; the sections below preserve the canonical listing copy for future updates.

## Summary

Automatically translate foreign-language webpages with site rules, privacy controls and one-click original restoration.

## Single purpose

Translate readable webpage text into a user-selected language, either on demand or automatically on websites the user authorizes.

## Description

Auto Page Translator for Brave is an independent, unofficial extension for people who want one configurable translation workflow across Brave and Chromium browsers.

The extension keeps the original website open and replaces readable text in place. Choose manual-only access, automatic translation on approved websites or automatic translation on every website you explicitly permit.

Key features:

- Explicit privacy setup before webpage text is processed
- Manual mode with temporary access by default
- Approved-site and all-site automatic modes
- Target-language, website and language rules
- Per-site target languages, glossary and protected terms
- Live-page, open Shadow DOM and accessible frame translation
- Sensitive-form safeguard, progress, cancellation and restoration
- On-device and user-configured translation-provider choices
- Provider-specific consent and session-only credential storage by default
- No analytics, advertising or developer-operated translation server

When an external provider is used, readable webpage text is sent over HTTPS to that provider. Review the privacy policy before enabling automatic translation on sensitive sites.

This extension is not developed, sponsored or endorsed by Brave Software or Google. Brave includes native Translate; this extension provides a separate global-rule and approved-site workflow.

## Permission justifications

- **activeTab:** temporary current-page access following an extension click, context-menu command or keyboard shortcut.
- **scripting:** injects the packaged in-page translator into a page the user has permitted.
- **storage:** stores ordinary preferences, local-only site/glossary rules, consent records and provider credentials that remain session-only unless the user asks the extension to remember them on the device.
- **contextMenus:** provides page, original-text and selected-text translation commands.
- **offscreen:** provides a document context for the browser's on-device Translator API where supported.
- **Optional HTTP/HTTPS website access:** requested from a user gesture only for the external translation provider, approved-site automation, all-site automation or user-supplied provider endpoint selected by the user. The extension has no permanent website access at installation.

## Data disclosure

**Clarification for the public “Authentication information” label:** this category applies only because users may optionally enter their own translation-provider API key. The extension never reads or collects website passwords, PINs, security answers, login form values or payment-card details.

- Website content: handled and, for external providers, transmitted solely to return translations.
- Browsing activity: current hostname is processed locally for user-facing site rules and is not retained as browsing history.
- Settings: stored through browser extension storage.
- Provider credentials: optional user-supplied translation API keys are treated as authentication information, stored in browser-session storage by default, optionally remembered locally after an explicit choice, sent only to the selected provider and never intentionally synchronized.

The full engineering-to-dashboard mapping is maintained in [DATA_MAP.md](DATA_MAP.md). The Chrome Web Store Privacy Practices form must declare website content and authentication information consistently with that map.

Remote code declaration: **No.** All executable code is packaged in the extension. Provider responses are treated only as translated text.

## Support URL

https://github.com/Conroy1988/Brave-Auto-Page-Translator/issues

## Homepage

https://github.com/Conroy1988/Brave-Auto-Page-Translator

## Privacy policy

https://github.com/Conroy1988/Brave-Auto-Page-Translator/blob/main/PRIVACY.md
