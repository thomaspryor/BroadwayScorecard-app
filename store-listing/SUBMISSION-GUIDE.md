# App Store Submission Guide

## Status
- [x] Code complete (feature flag OFF for v1.0.0)
- [x] TypeScript passes clean
- [x] eas.json configured (ascAppId, API key, team ID)
- [x] App Store metadata prepared (description, keywords, category)
- [x] Privacy nutrition labels documented (no data collected)
- [ ] Production build (building on EAS)
- [ ] Screenshots (need 6.7" iPhone + 6.5" iPhone)
- [ ] Submit to App Store Connect

## What You'll Enter in App Store Connect

### App Information
- **Name**: Broadway Scorecard
- **Subtitle**: Critic Scores & Show Reviews
- **Category**: Entertainment (primary), Reference (secondary)
- **Content Rights**: Does not contain third-party content (we aggregate scores, not copyrighted text)
- **Age Rating**: 4+ (no objectionable content)

### Pricing
- **Price**: Free
- **Availability**: All territories

### Privacy
- **Privacy Policy URL**: https://broadwayscorecard.com/privacy
- **Data Collection**: Select "No, we do not collect data from this app"

### Version Information
- **Description**: (see store-listing/metadata.json)
- **Keywords**: broadway,theater,theatre,reviews,scores,musicals,plays,off-broadway,west end,critic,ratings,audience
- **Support URL**: https://broadwayscorecard.com
- **Marketing URL**: https://broadwayscorecard.com

### Review Information
- **Notes for Reviewer**: "Broadway Scorecard is a theater review aggregator. It displays critic scores and audience grades for Broadway, Off-Broadway, and West End shows. All data comes from publicly available professional reviews. No login or account is required to use the app. The app fetches show data from our CDN at broadwayscorecard.com/data/."

## Screenshots Required
Apple requires screenshots for:
1. **6.7" Display** (iPhone 15 Pro Max / 16 Pro Max) - 1290 x 2796 px
2. **6.5" Display** (iPhone 11 Pro Max) - 1242 x 2688 px (optional if 6.7" provided)

Recommended screenshots (6-10):
1. Home page with featured shows
2. Browse page with show cards
3. Show detail page (top section with score)
4. Show detail page (reviews section)
5. Search results
6. Score toggle (audience view)

## Submitting

Once the production build completes:
```bash
# Submit the latest production build
eas submit --platform ios --latest
```

Or submit a specific build:
```bash
eas submit --platform ios --id BUILD_ID
```

The ASC API key at `../AuthKey_7MPPJ2254M.p8` will be used for automated submission.
