# Translation Provider Guide

## Automatic provider selection

The extension tries providers in this order:

1. Browser on-device Translator API when available for the detected language pair.
2. Google Cloud Translation if a user API key is configured.
3. LibreTranslate if a user endpoint is configured.
4. DeepL API if a user API key is configured.
5. Google web compatibility translation only if its fallback is enabled.

Only providers whose named text-route disclosure has been explicitly accepted can be included. The compatibility fallback is off by default.

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

The key is kept in temporary browser-session storage by default and is not synchronized. Select **Remember provider credentials on this device** only on a trusted device. Browser extensions cannot keep a user-entered client-side API key secret from the local browser profile; use quotas and restrictions.

## LibreTranslate

Enter the complete `/translate` endpoint, for example `https://translate.example.com/translate`, and an API key if the server requires one. HTTPS is required except for a deliberate local `localhost` or `127.0.0.1` installation.

Review the server operator's logging, retention, security and supported-language policies. The extension does not operate or endorse a public LibreTranslate instance.

## DeepL API

1. Create a DeepL API Free or API Pro account and obtain an authentication key.
2. Paste the key into Settings, select the matching plan and choose **DeepL API** or **Automatic provider selection**.
3. Accept the named DeepL page-text route and grant the narrow `api-free.deepl.com` or `api.deepl.com` permission prompt.
4. Use **Test configured provider**.

The key is sent in DeepL's authorization header, never in the URL. DeepL terms, quota, billing and data-processing rules apply directly to the user's account.

## Google web compatibility service

This optional provider is not the authenticated Google Cloud Translation API. It may change, rate-limit requests or become unavailable without notice. It is off by default, requires separate consent and should remain a fallback rather than a contractual dependency for managed deployments.
