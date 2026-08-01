<div align="center">
  <img src="assets/icon.svg" width="116" alt="Brave Auto Page Translator icon">
  <h1>Brave Auto Page Translator</h1>
  <p><strong>Automatic, in-page translation for Brave and Chromium browsers.</strong></p>
  <p>
    <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-6d5dfc?style=for-the-badge">
    <img alt="No analytics" src="https://img.shields.io/badge/Analytics-None-0f9f8f?style=for-the-badge">
    <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-222233?style=for-the-badge">
  </p>
</div>

> [!IMPORTANT]
> This is an independent, unofficial extension. It is not developed, sponsored, or endorsed by Brave Software or Google.

## What it does

Brave Auto Page Translator detects the primary language of a webpage and translates its readable text directly inside the original page. The website stays on its real address, so logins, Cloudflare checks, cookies, navigation, and interactive features are not moved through a translated-page proxy.

- Automatic language detection using Chromium's Tabs API
- English by default, with 37 selectable target languages
- In-place translation of visible DOM text and useful accessibility attributes
- Support for text added later by live feeds, menus, and infinite scrolling
- Support for accessible open shadow DOM and document frames
- Per-language and per-website exclusions
- Pause switch, manual translation, and one-click restoration of the original text
- Toolbar status badges and synchronized browser settings
- No analytics, advertising, telemetry, or developer-operated server

## Install for development

1. Download or clone this repository.
2. Open `brave://extensions` in Brave.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.

The extension opens its settings page after first installation. Because automatic translation must read and replace webpage text, Brave asks for access to websites when the extension is installed.

## How translation works

1. Chromium detects the page's main language.
2. The extension checks your target language and exclusion rules.
3. Readable text is collected from the page in small batches.
4. Those text batches are sent to Google's text-translation service.
5. Translations replace the corresponding text nodes without leaving or reloading the website.
6. A mutation observer translates newly added text. The original values are retained so they can be restored.

The page URL, cookies, passwords, form entries, and complete HTML are not included in translation requests. Read [PRIVACY.md](PRIVACY.md) before using automatic translation on sensitive pages.

## Development

Requires Node.js 20 or newer. There are no runtime or development dependencies.

```bash
npm run validate
npm run package
```

Validation checks the Manifest V3 package, JavaScript syntax, icons, permissions, non-navigation architecture, and regression tests. Packaging creates a Chrome Web Store-compatible ZIP in `dist/`.

## Release and Chrome Web Store path

Tags matching `v*` trigger the release workflow, which validates the extension, builds the ZIP, and attaches it to a GitHub Release. That ZIP can be submitted to the Chrome Web Store after the listing, screenshots, privacy disclosures, and publisher account are completed.

## Honest limitations

No browser extension can translate every surface. Brave/Chrome internal pages, extension pages, the built-in PDF viewer, text baked into images or video, canvas-rendered text, and closed or protected frames are inaccessible to ordinary content scripts. Some sites deliberately mark text as non-translatable. Translation also depends on the availability and rate limits of Google's external translation service.

For ordinary HTTP and HTTPS pages—including authenticated or anti-bot-protected sites that are already open in the browser—the in-page design avoids the blank proxy-page failure seen in versions 0.1.x.

## Licence

Released under the [MIT Licence](LICENSE).
