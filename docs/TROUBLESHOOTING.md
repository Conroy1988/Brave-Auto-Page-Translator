# Troubleshooting

## Privacy setup required

Open **Settings & privacy**, choose **Review privacy setup**, read the disclosure and accept it. Translation remains blocked until the current disclosure version is accepted.

## Website access declined

Manual translation works after clicking the extension because it uses temporary access. For automatic translation, approve the current site from the popup or grant all-site access in Settings.

## Private-page safeguard

The page contains a password or payment field. Automatic translation is paused. Use **Translate this page** manually if it is appropriate to send the readable text to the chosen provider.

## Provider unavailable or rate limited

Open Settings and run **Test configured provider**. Check internet access, provider quota, billing, API-key restrictions and endpoint availability. Automatic mode may use the disclosed compatibility fallback when enabled.

## No readable page text

The visible content may be inside an image, video, canvas, built-in PDF viewer, closed Shadow DOM or protected frame. Ordinary content scripts cannot translate those surfaces.

## Some text remains untranslated

Check for `translate="no"`, `.notranslate`, editable controls, hidden content, code/preformatted content or a late-created closed Shadow DOM. Attribute translation is disabled by default.

## A page becomes slow

Disable live-page translation for that site and report the public URL if it is safe to share. Include the privacy-safe diagnostic report but never include copied private page text.
