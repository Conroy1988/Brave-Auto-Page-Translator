# Translation Provider Guide

## Automatic provider selection

The extension tries providers in this order:

1. Browser on-device Translator API when available for the detected language pair.
2. Google Cloud Translation if a user API key is configured.
3. LibreTranslate if a user endpoint is configured.
4. Google web compatibility translation if its fallback is enabled.

If a selected provider is unavailable, the popup reports which engine ultimately handled the page.

## Browser on-device translator

No provider credential is required. Browser support and supported language pairs vary. The browser may download language models. If an automatic page has no reliable source-language result, an external fallback may be required.

## Google Cloud Translation

1. Create or select a Google Cloud project.
2. Enable Cloud Translation Basic API.
3. Enable billing and configure quotas/budget alerts.
4. Create an API key and restrict it as tightly as the Google Cloud console permits for your use case.
5. Paste the key into Settings and select **Google Cloud Translation** or **Automatic provider selection**.
6. Use **Test configured provider**.

The key is stored in local extension storage, not synchronized by this extension. Browser extensions cannot keep a user-entered client-side API key secret from the local browser profile; use quotas and restrictions.

## LibreTranslate

Enter the complete `/translate` endpoint, for example `https://translate.example.com/translate`, and an API key if the server requires one. HTTPS is required except for a deliberate local `localhost` or `127.0.0.1` installation.

Review the server operator's logging, retention, security and supported-language policies. The extension does not operate or endorse a public LibreTranslate instance.

## Google web compatibility service

This provider keeps the extension usable without configuration but is not the authenticated Google Cloud Translation API. It may change, rate-limit requests or become unavailable without notice. It should remain a fallback rather than a contractual dependency for managed deployments.
