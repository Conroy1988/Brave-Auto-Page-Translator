# Chrome Web Store Submission Checklist

> [!NOTE]
> **Published:** [Private Auto Page Translator on the Chrome Web Store](https://chromewebstore.google.com/detail/auto-page-translator-for/pilpighhgdglgngmakjepoadacbhpoeo)  
> **Extension ID:** `pilpighhgdglgngmakjepoadacbhpoeo`  
> This checklist is the release gate for store updates. Development happens in GitHub; validated packages are then submitted to the Chrome Web Store.

## Engineering gate

- [ ] `npm ci`
- [ ] `npm run validate`
- [ ] `npm run store:assets`
- [ ] `npm run package`
- [ ] `npm run package:verify`
- [ ] `npm run checksums`
- [ ] Exact packaged ZIP passes `npm run test:e2e`
- [ ] `npm run audit`
- [ ] Manual Brave stable matrix complete
- [ ] Manual Chrome stable matrix complete
- [ ] No secrets or test-only code in ZIP
- [ ] Manifest is at ZIP root
- [ ] Version is higher than every previously uploaded version
- [ ] Contextual inline boundaries and damaged-marker fallback pass
- [ ] Bilingual/hover mode switches do not send a second provider request
- [ ] Privacy Firewall masks configured values and fails closed on token damage
- [ ] Smart Compose never replaces writing without explicit confirmation
- [ ] Side panel and Smart Compose keyboard/focus accessibility checks pass
- [ ] All 20 locale catalogs parse and provide every required message

## Policy gate

- [ ] Single-purpose statement copied from `STORE_LISTING.md`
- [ ] Every permission justified exactly, including `sidePanel`
- [ ] Website content disclosed
- [ ] Explicit writing translation and memory-only recent translation history disclosed
- [ ] Authentication information disclosed for user-supplied provider credentials
- [ ] Privacy Firewall behavior and limits disclosed without implying absolute anonymization
- [ ] `DATA_MAP.md`, Privacy Practices form, privacy policy and UI match
- [ ] Local browsing-hostname handling disclosed truthfully
- [ ] Remote code set to No
- [ ] Limited Use certifications completed
- [ ] Privacy policy URL public and current
- [ ] Extension UI, listing, privacy form and code agree
- [ ] Independent/unofficial disclaimer visible
- [ ] No claim that Brave lacks native translation
- [ ] No claim that every protected browser surface can be translated

## Listing assets

- [ ] 128×128 store icon
- [ ] Five 1280×800 screenshots reviewed against the v1.2.0 UI and feature set
- [ ] 440×280 small promotional tile
- [ ] Optional 1400×560 marquee tile
- [ ] Images are sharp when downscaled and contain no private page content
- [ ] Manifest name, locale names and store title consistently use **Private Auto Page Translator**

## Publisher gate

- [ ] Chrome Web Store developer registration paid
- [ ] Permanent developer email verified and monitored
- [ ] Two-step verification enabled
- [ ] Required publisher/trader identity fields completed
- [ ] Support URL and privacy URL verified in a signed-out browser
- [ ] Distribution countries and visibility selected

## Release gate

- [ ] Exact Git commit recorded
- [ ] Release ZIP checksum recorded
- [ ] GitHub build-provenance attestation generated
- [ ] GitHub release published
- [ ] Canonical v1.2.0 listing copy and regenerated promotional assets reviewed
- [ ] Web Store package uploaded from the verified release artifact
- [ ] Protected submission workflow used with `skipReview: false` and `blockOnWarnings: true`, or equivalent dashboard checks completed manually
- [ ] Review emails monitored
- [ ] Rollback version and incident process ready
