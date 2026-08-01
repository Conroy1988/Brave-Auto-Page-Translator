# Chrome Web Store Submission Checklist

## Engineering gate

- [ ] `npm ci`
- [ ] `npm run validate:full`
- [ ] `npm run store:assets`
- [ ] `npm run package`
- [ ] Manual Brave stable matrix complete
- [ ] Manual Chrome stable matrix complete
- [ ] No secrets or test-only code in ZIP
- [ ] Manifest is at ZIP root
- [ ] Version is higher than every previously uploaded version

## Policy gate

- [ ] Single-purpose statement copied from `STORE_LISTING.md`
- [ ] Every permission justified exactly
- [ ] Website content disclosed
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
- [ ] Five 1280×800 screenshots reviewed against current UI
- [ ] 440×280 small promotional tile
- [ ] Optional 1400×560 marquee tile
- [ ] Images are sharp when downscaled and contain no private page content

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
- [ ] GitHub release published
- [ ] Web Store package uploaded from the verified release artifact
- [ ] Review emails monitored
- [ ] Rollback version and incident process ready
