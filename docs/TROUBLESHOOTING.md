# Troubleshooting

## Privacy setup required

Open **Settings & privacy**, choose **Review privacy setup**, read the disclosure and accept it. Translation remains blocked until the current disclosure version is accepted.

## Website access declined

Manual translation works after clicking the extension because it uses temporary access. For automatic translation, approve the current site from the popup or grant all-site access in Settings.

## Private-page safeguard

The page contains a password or payment field. Automatic translation is paused. Use **Translate this page** manually if it is appropriate to send the readable text to the chosen provider.

## Provider unavailable or rate limited

Open Settings and run **Test configured provider**. Check internet access, provider quota, billing, API-key restrictions and endpoint availability. Automatic mode may use the disclosed compatibility fallback when enabled.

## Provider approval required

Open **Settings & privacy**, review the named provider data route and explicitly accept it. Selecting a provider, entering a key and accepting the general privacy checkpoint do not silently approve a new external provider.

## Credentials disappeared after restarting the browser

This is the privacy-preserving default: keys are held only for the browser session. Re-enter the key, or enable **Remember provider credentials on this device** on a trusted device.

## Private/incognito window

Automatic translation and rule changes are disabled in private windows. Click **Translate this page** for a one-time manual translation. The extension does not save private-window site or language rules.

## No readable page text

The visible content may be inside an image, video, canvas, built-in PDF viewer, closed Shadow DOM or protected frame. Ordinary content scripts cannot translate those surfaces.

## Some text remains untranslated

Check for `translate="no"`, `.notranslate`, editable controls, hidden content, code/preformatted content or a late-created closed Shadow DOM. Attribute translation is disabled by default.

## Privacy Firewall blocked a result

The provider removed or altered a protected placeholder, so the extension rejected the entire translation rather than restore private values into uncertain positions. Retry, use the browser's on-device translator, choose another provider or translate less text. Do not disable the Firewall for sensitive content merely to bypass the error.

## Smart Compose is unavailable

Smart Compose must be enabled and used from a supported text, search or multiline editor. It intentionally avoids login, password, passcode, PIN, one-time-code, payment-card and security-code fields. Some complex rich-text editors do not expose a safely replaceable value.

## On-device language pack will not prepare

The browser may not implement the Translator API or support the requested language pair. Keep the browser current, try a known source language rather than automatic detection, or configure an explicitly approved external provider.

## A page becomes slow

Disable live-page translation for that site and report the public URL if it is safe to share. Preview the privacy-safe support report before copying or exporting it, and never include copied private page text.
