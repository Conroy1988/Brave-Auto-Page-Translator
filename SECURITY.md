# Security Policy

## Supported versions

Security fixes are applied to the latest public Chrome Web Store version and the current `main` branch.

## Reporting a vulnerability

Use GitHub's private **Security → Report a vulnerability** flow for vulnerabilities that could expose webpage text, provider credentials, extension storage or browsing access. If private vulnerability reporting is unavailable, open a minimal GitHub issue asking for a private contact channel.

Do not include API keys, cookies, authentication information, private URLs, personal data or copied webpage text in a public issue.

Include only:

- extension and browser version;
- affected component;
- reproduction steps using a non-sensitive demonstration page;
- expected and actual behaviour;
- impact assessment.

## Security design

- Manifest V3 with no remotely hosted executable code.
- Manual `activeTab` access by default.
- Optional website permissions requested from a user gesture.
- Explicit consent before page content is handled.
- HTTPS external-provider requests, except user-configured localhost services.
- Provider secrets stored in browser-session storage by default, optionally remembered locally after explicit opt-in, and excluded from diagnostics and backups.
- Provider-specific consent enforced before any external engine can receive page text.
- Privacy Firewall masking for recognized values and user-defined terms, with fail-closed token restoration.
- Smart Compose restricted to explicit user actions on supported non-sensitive editors, with preview before replacement.
- Memory-only recent translation history that is deleted when its tab closes or the browser session ends.
- Trusted-context storage access levels, versioned storage migration and local-only site/glossary/privacy rules.
- Exact release-ZIP tests, archive policy inspection, recognized-secret scanning, checksums, dependency audit, CodeQL and dependency update monitoring.
- No analytics, ads, telemetry or developer-operated relay.
- DOM text is applied through text properties rather than executable HTML.
- Bounded request sizes, concurrency, timeouts, retries, cache and circuit breaking.
- Translation jobs are cancelled on navigation, restoration and superseding requests.

## Threat-model boundaries

The Privacy Firewall reduces accidental disclosure but is not a general anonymizer and cannot identify every sensitive value. The extension cannot control what a user-selected translation provider records after receiving a request. Users should review that provider's contract and privacy policy. A compromised browser profile or browser process remains outside the extension's trust boundary. Users should avoid remembering provider credentials on shared devices.
