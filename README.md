<div align="center">
  <img src="assets/icon.svg" width="116" alt="Brave Auto Page Translator icon">
  <h1>Brave Auto Page Translator</h1>
  <p><strong>Automatic, rule-driven webpage translation for Brave and Chromium browsers.</strong></p>
  <p>
    <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-6d5dfc?style=for-the-badge">
    <img alt="No analytics" src="https://img.shields.io/badge/Analytics-None-0f9f8f?style=for-the-badge">
    <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-222233?style=for-the-badge">
  </p>
</div>

> [!IMPORTANT]
> This is an independent, unofficial extension. It is not developed, sponsored, or endorsed by Brave Software or Google.

## What it does

Brave Auto Page Translator detects the primary language of each completed webpage. When the page is in a different language from your chosen target, it opens the translated-page service automatically.

- Automatic language detection using Chromium's Tabs API
- English as the default target, with 37 selectable target languages
- Per-language and per-website exclusions
- Pause switch and one-click manual translation
- Same-tab or new-tab translation
- Toolbar status badges
- Synchronized browser settings
- No injected scripts, analytics, advertising, or blanket website access

## Install for development

1. Download or clone this repository.
2. Open `brave://extensions` in Brave.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.

The extension opens its settings page after first installation.

## How translation works

The extension asks Chromium to detect the page language. If the page passes your rules, the browser navigates to Google Translate's translated-page URL. Google retrieves and renders the public webpage in your target language.

This approach avoids embedded API keys and does not require a developer-operated server. It is best suited to public webpages. Websites requiring authentication, complex web apps, protected pages, and some dynamically rendered content may not work through a translation proxy.

Read [PRIVACY.md](PRIVACY.md) before translating sensitive pages.

## Development

Requires Node.js 20 or newer. There are no runtime or development dependencies.

```bash
npm run validate
npm run package
```

The package command creates a Chrome Web Store-compatible ZIP inside `dist/`. Pull requests and pushes to `main` are validated automatically by GitHub Actions.

## Release path

Tags matching `v*` trigger the release workflow, which validates the extension, builds the ZIP, and attaches it to a GitHub Release. The same ZIP can be submitted to the Chrome Web Store after its store listing and privacy declarations are completed.

## Current limitations

- Desktop Chromium browsers only; mobile Brave does not support Chrome extensions.
- Translation depends on Google Translate's translated-page availability.
- Private and authenticated pages should be excluded.
- Chrome internal pages and extension pages cannot be translated.

## Licence

Released under the [MIT Licence](LICENSE).
