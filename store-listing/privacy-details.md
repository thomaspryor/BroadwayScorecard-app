# App Store Privacy Details (v1.1)

Answers for the App Store Connect privacy questionnaire (App Privacy section).
Checked against the code on 2026-10-20. Update this file whenever an SDK or a
synced field is added. The v1.0.0 answer ("no data collected") is no longer
true: v1.1 has accounts, PostHog analytics, Sentry crash reporting, photo
uploads and push notifications.

## Do you or your third-party partners collect data from this app?
**Yes**

## Tracking
**No.** No advertising SDKs, no data brokers, no App Tracking Transparency
prompt. PostHog and Sentry data is used only to improve the app and is not
combined with third-party data for advertising.

## Data types to declare

| Apple category | Data type | Source in code | Linked to user | Purpose |
|---|---|---|---|---|
| Contact Info | Email Address | Apple / Google sign-in via Supabase Auth (`lib/auth-context.tsx`) | Yes | App Functionality |
| Contact Info | Name | Display name from Apple / Google sign-in (`profiles.display_name`) | Yes | App Functionality |
| User Content | Photos or Videos | Diary photos uploaded to Supabase Storage (`lib/photo-upload-queue.ts`) | Yes | App Functionality |
| User Content | Other User Content | Ratings, written reviews, diary dates, watchlist, lists | Yes | App Functionality |
| Identifiers | User ID | Supabase user id; also sent to PostHog `identify` and Sentry `setUser` | Yes | App Functionality, Analytics |
| Usage Data | Product Interaction | PostHog events (`lib/analytics.ts`) | Yes (identified after sign-in) | Analytics |
| Diagnostics | Crash Data | Sentry (`lib/sentry.ts`) | Yes (user id only, no email) | App Functionality |
| Diagnostics | Performance Data | Sentry tracing (`tracesSampleRate: 0.1`) | Yes | App Functionality |

Not collected: location, contacts, health, financial info, browsing history,
search history (search analytics send the query length only, not the text),
purchases, sensitive info, audio, advertising data, device ID.

Push tokens are stored in `push_tokens` linked to the user so we can send
notifications. Apple does not list push tokens as a separate data type; they
are covered by App Functionality.

## Guests (not signed in)
Guests still send anonymous PostHog events and Sentry crash reports. Their
watchlist stays on the device (`@bsc:local_watchlist`) and is not uploaded
until they sign in.

## Account deletion
Settings > Delete Account calls the `delete-account` edge function (web repo,
`supabase/functions/delete-account`), which deletes the user's rows, their
diary photos in Storage and the auth user. Known gap: the Sign in with Apple
token is not revoked on deletion (Apple asks apps to revoke it).
