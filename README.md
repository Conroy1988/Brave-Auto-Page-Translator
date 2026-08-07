<div align="center">
  <img src="assets/icon.svg" width="116" alt="Private Auto Page Translator icon">
  <h1>Private Auto Page Translator</h1>
  <p><strong>Context-aware translation for Brave, Chrome and Chromium browsers.</strong></p>
  <p>
    <a href="https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo"><img alt="Install from the Chrome Web Store" src="https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
    <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-6d5dfc?style=for-the-badge">
    <img alt="Privacy Firewall" src="https://img.shields.io/badge/Privacy-Firewall-0f9f8f?style=for-the-badge">
    <img alt="Analytics" src="https://img.shields.io/badge/Analytics-None-0f9f8f?style=for-the-badge">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-222233?style=for-the-badge">
  </p>
</div>

> [!IMPORTANT]
> This is an independent, unofficial extension. It is not developed, sponsored or endorsed by Brave Software or Google. Brave includes native Translate; this project offers a separate privacy-first workflow with contextual translation, reading modes, writing assistance and per-site controls.

## Install

[**Install Private Auto Page Translator from the Chrome Web Store →**](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo)

The Chrome Web Store is the official installation and automatic-update channel for Brave, Chrome and other Chromium browsers. GitHub is the public source, issue tracker and development home.

## What it does

The extension translates readable text directly inside the original webpage. The site remains on its real address, so logins, cookies, navigation and interactive features are not moved through a translated-page proxy.

- **Context-aware translation:** keeps nearby inline text together so sentences split across links, emphasis and spans translate coherently.
- **Three reading modes:** translated, side-by-side bilingual and translated-with-original-on-hover.
- **Viewport-first processing:** translates what is visible before continuing through the rest of a long page.
- **Privacy Firewall:** masks common email addresses, URLs, phone numbers, IP addresses, dates, amounts, references and user-defined confidential terms before external requests; translation fails closed if a protected token is altered.
- **Smart Compose:** previews translations for textareas and safe editable fields, with natural, formal and informal styles. Replacement happens only after an explicit confirmation. Use the on-page button, context menu or `Alt+Enter`.
- **Persistent workspace:** the side panel keeps page controls, site settings, a quick text translator, language-pack preparation and session-only recent translations close at hand.
- **Site intelligence:** remember the target, provider, reading mode, automatic behaviour and sensitive-page override for individual sites.
- **Language-pack manager:** prepare supported on-device language pairs before they are needed.
- **Modern-page support:** incrementally handles feeds, SPAs, infinite scrolling, open Shadow DOM and accessible frames.
- **Private by default:** manual `activeTab` access, explicit consent, provider-specific approval, session-only credentials, no account, no subscription and no analytics.
- **20 localized catalogs:** core setup and navigation labels are available in Arabic, Chinese, Czech, Dutch, English, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Swedish, Turkish and Ukrainian.

## Provider choices

Automatic provider selection prefers the browser's on-device Translator API where available. You can instead configure Google Cloud Translation, DeepL API or a LibreTranslate server. A separately disclosed Google web compatibility route remains off by default.

External providers receive only the text needed for the requested translation. When the Privacy Firewall is enabled, recognized private values are masked first. Each external route requires explicit approval, and no developer-operated translation relay sits between the extension and the selected provider.

Read [the provider guide](docs/PROVIDER_GUIDE.md) before configuring an external service.

## Install from source

Most users should use the [Chrome Web Store listing](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo). For local development:

1. Download or clone this repository.
2. Open `brave://extensions` or `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.
6. Complete the privacy and access setup that opens after installation.

The default mode is manual. Website-wide access is requested only when the user enables an automatic rule.

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run validate
npm run package
npm run package:verify
npm run test:e2e
```

`npm run validate` checks the Manifest V3 package, JavaScript syntax, icons, minimum permissions, consent architecture, provider boundaries and unit regressions. Playwright loads the packaged extension into Chromium against local fixtures with mocked provider responses.

Tags matching `v*` trigger the release workflow. It audits dependencies, validates and tests the exact ZIP, verifies contents, creates checksums and a CycloneDX dependency inventory, records build provenance and attaches artifacts to a GitHub Release. A protected workflow submits an already verified release through the Chrome Web Store V2 API with review enabled and warnings treated as blockers.

## Keyboard shortcuts

- `Alt+Shift+T`: translate the current page
- `Alt+Shift+O`: restore original page text
- `Alt+Enter`: preview a translation of writing in the focused supported editor

Browser-level shortcuts can be changed in the extension-shortcut settings.

## Honest limitations

No ordinary browser extension can translate every surface. Browser-internal pages, extension pages, built-in PDF viewers, text inside images or video, canvas-rendered text, closed Shadow DOM and some protected or sandboxed frames are inaccessible. Sites can also mark content as non-translatable.

On-device translation and language-pair downloads depend on browser support. Translation quality and availability depend on the selected provider. The extension fails safely, preserves original page content and reports actionable errors when a provider or permission is unavailable.

## Support and security

- [Support and troubleshooting](SUPPORT.md)
- [Compatibility matrix](docs/COMPATIBILITY.md)
- [Privacy policy](PRIVACY.md)
- [User data map](DATA_MAP.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Licence

Released under the [MIT Licence](LICENSE).
