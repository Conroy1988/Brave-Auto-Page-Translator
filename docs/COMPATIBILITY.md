# Compatibility Matrix

## Brave without the on-device Translator API

Version 1.2.1 detects this condition during the versioned privacy setup. When Automatic mode has no configured external route, setup recommends the disclosed Google web compatibility fallback, records provider-specific consent, and requests only the provider origins. Declining keeps translation on-device-only and transmits no page text.

## Browser release gate

Every public release must pass:

| Browser | Required pass |
|---|---|
| Brave stable desktop | Manual, approved-site and all-site modes |
| Chrome stable desktop | Manual, approved-site and all-site modes |
| Chromium used by Playwright | Automated fixture suite |

The nightly GitHub Actions matrix runs the packaged extension suite against current Chromium, Google Chrome stable and Brave stable. A nightly failure blocks the next release until triaged, but does not automatically publish or roll back a store version.

## Production-package checks

The fixture suite has deliberately pre-granted access and a simulated provider. It checks deterministic translation behaviour, not real permission dialogs. A separate `production-package.spec.mjs` suite loads the ZIP with its manifest unchanged, starts without host access, completes on-device-only consent through the UI, and approves test-site access through the browser's extension-management API in a disposable profile, then activates and verifies that permission using the production extension's permissions API. It checks workspace navigation, failure recovery, editing, preference preservation across a browser restart, narrow layouts and Arabic direction. External-service uptime and interactive permission prompts require separate smoke checks.

Every PR must pass Chromium, Chrome stable and Brave stable jobs before its validation compatibility gate succeeds. Chrome stable uses the browser's supported CDP extension-installation path because its old command-line sideload switches are unavailable.

## Page fixture coverage

- Static text and whitespace preservation
- Contextual inline-element grouping and damaged-boundary fallback
- Viewport-first ordering and deferred off-screen translation
- Translated, bilingual and original-on-hover reading modes without repeat requests
- SPA rerender and rapid node replacement
- Infinite-scroll/live content
- Open Shadow DOM
- Same-origin iframe
- Cross-origin HTTP/HTTPS iframe where permission exists
- Related `about:blank`, `srcdoc`, `data:` and `blob:` frames
- Nodes removed during pending translation
- Password and payment-form automatic safeguards
- Site/language exclusion and per-site targets
- Original restoration, cancellation and navigation
- Provider success, malformed response, timeout, offline, HTTP 429 and HTTP 5xx
- Large-page batching and simultaneous tabs
- Versioned storage migration and credential-free backup import/export
- Provider-specific consent and external-provider outage fallback
- Privacy Firewall masking, custom terms and token-integrity failure
- Smart Compose preview, style selection and confirm-before-replace behavior
- Side-panel status, quick translation, site profile and language-pack controls
- Incognito/manual-only rule non-persistence
- Popup, side panel, onboarding and settings control-name accessibility checks

## Intentionally unsupported surfaces

- `brave://`, `chrome://` and browser extension pages
- Built-in PDF viewers
- Closed Shadow DOM
- Canvas, image and video text
- Frames whose browser security boundary prevents extension access
- Content deliberately marked `translate="no"` or `.notranslate`
- Rich-text editors whose application state cannot safely accept normal input/change events
