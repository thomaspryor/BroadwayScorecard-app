# App Store Privacy Details (v1.0.0)

## Data Collection Summary
**Broadway Scorecard does not collect any user data in v1.0.0.**

## Privacy Nutrition Labels
When filling out the App Store Connect privacy questionnaire:

### Do you or your third-party partners collect data from this app?
**No**

### Reasoning
- No user accounts or authentication (feature flag OFF)
- No analytics or tracking SDKs
- No advertising
- No crash reporting service (errors caught by local ErrorBoundary only)
- No location services
- No device identifiers collected
- Show data is fetched from our CDN (broadwayscorecard.com) — this is read-only public data, not user data
- AsyncStorage is used only for local preferences (onboarding seen, cache) — never sent to any server

## When User Accounts Are Enabled (future v1.1)
Will need to update privacy labels to declare:
- **Contact Info** (email, name) — used for account creation via Apple/Google Sign-In
- **User Content** (reviews, ratings) — user-generated ratings synced via Supabase
- Data linked to identity: Yes (user accounts)
- Data used for tracking: No
