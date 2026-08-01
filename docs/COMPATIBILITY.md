# Compatibility Matrix

## Browser release gate

Every public release must pass:

| Browser | Required pass |
|---|---|
| Brave stable desktop | Manual, approved-site and all-site modes |
| Chrome stable desktop | Manual, approved-site and all-site modes |
| Chromium used by Playwright | Automated fixture suite |

## Page fixture coverage

- Static text and whitespace preservation
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

## Intentionally unsupported surfaces

- `brave://`, `chrome://` and browser extension pages
- Built-in PDF viewers
- Closed Shadow DOM
- Canvas, image and video text
- Frames whose browser security boundary prevents extension access
- Content deliberately marked `translate="no"` or `.notranslate`
