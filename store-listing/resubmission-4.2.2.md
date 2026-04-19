# Resubmission for Guideline 4.2.2 Rejection

**Context:** v1.0 (build 48) was rejected 2026-03-10 on iPad Air 11-inch (M3) under Guideline 4.2.2 (Design: Minimum Functionality). Reviewer text: "the app only includes links, images, or content aggregated from the Internet with limited or no native functionality... does not sufficiently differ from a web browsing experience."

**Why it got rejected:** At submission, `features: ""` was set in `app.json` — the `userAccounts` feature flag was OFF. My Shows, watchlist, ratings, and lists tabs were entirely hidden from the tab bar. The reviewer saw 2 tabs (Home + Browse) — browse-only, looking like a web wrapper.

**What's different now:**
- `userAccounts` flag is ON → 5 tabs visible (Home, Watched, To Watch, Lists, Browse)
- Apple Sign-In + Google Sign-In + **NEW: Email/password sign-in** wired through the SignInSheet
- **NEW: Demo reviewer account pre-seeded** with 5 rated shows, 3 watchlist entries, and 1 custom list (see credentials below)
- Supabase-synced diary, watchlist, and lists
- Rating system with haptic-feedback star input (0.5-star precision via gesture)
- Sentry crash reporting live; push notifications registered on launch
- New native features added since March (non-auth-gated): Tony Awards carousel, NYT Critic's Picks carousel, Theater Seating Guide (interactive), Video Reviews, Social Scorecard, Other Productions section, share-as-image

---

## 🔑 Demo account for App Review

```
Email:    reviewer@broadwayscorecard.com
Password: BwayReview2026!
```

This account is pre-seeded with sample data so the reviewer immediately sees the native personal features in action — no empty states, no waiting for data to save and re-load.

**Reviewer flow (30 seconds):**
1. On app launch, tap any rating star on a show, OR tap the **Watched / To Watch / Lists** tab
2. The Sign In sheet appears with three options: Google, Apple, or **"Sign in with email"** (text link below the provider buttons)
3. Tap **"Sign in with email"** → enter the credentials above
4. You land in a signed-in state with:
   - **Watched tab:** 5 rated shows (Death of a Salesman 5★, Titanique 4.5★, CATS: The Jellicle Ball 4.5★, Giant 4★, Chess 3.5★)
   - **To Watch tab:** 3 watchlist entries (Proof, Every Brilliant Thing, Two Strangers)
   - **Lists tab:** 1 custom list "Must See This Season" with 3 ranked shows

---

## Submission ID for Resolution Center reply
`99077a80-4dc5-496d-a5f6-d42aea4c07c5`

---

## App Review Notes (paste into ASC Version → App Review Information → Notes)

> Broadway Scorecard is a native iOS app built with React Native (Expo SDK 54). It is NOT a web view wrapper and does not embed a browser. All screens render in native React Native components (FlatList, Pressable, react-native-reanimated).
>
> **🔑 DEMO ACCOUNT (pre-seeded for your convenience):**
> - Email: reviewer@broadwayscorecard.com
> - Password: BwayReview2026!
>
> **HOW TO EXPLORE THE PERSONAL FEATURES (4 steps):**
> 1. Tap any show's star icon, or tap the Watched / To Watch / Lists tab
> 2. On the Sign In sheet, tap "Sign in with email" (text link below the Google/Apple buttons)
> 3. Enter the demo credentials above
> 4. You'll immediately see 5 rated shows in Watched, 3 shows in To Watch, and a custom ranked list in Lists
>
> **WHAT YOU CAN DO AS THE DEMO USER:**
> - **Watched tab:** 5 pre-rated shows with reviews, sortable by date or rating, grid/list toggle, swipe to delete
> - **To Watch tab:** 3 saved shows — tap bookmark to remove, or tap a show to rate it (which moves it to Watched)
> - **Lists tab:** 1 list "Must See This Season" — tap to see 3 ranked entries; add or reorder shows
> - **Any show detail page:** Tap stars to rate (haptic feedback + 0.5-star gesture precision), tap bookmark to watchlist, tap share to generate a native score card image
>
> **NATIVE FEATURES VISIBLE WITHOUT SIGN-IN (first-launch experience):**
> - **Home tab:** Featured Carousel, Closing Soon countdown badges, Top Shows, Best Musicals, Best Plays, Tony Winners, NYT Critic's Picks carousel, Other Productions shelf
> - **Browse tab:** Fuzzy search across 700+ shows (Fuse.js), native filter pills with haptic feedback, market picker toggle (Broadway / Off-Broadway / West End), critic ↔ audience score toggle
> - **Show detail:** Score breakdown bars, review excerpts, ticket CTAs, Theater Seating Guide (interactive visualization), Video Reviews carousel (native playback), Social Scorecard (Reddit/social sentiment), Cast & Creative, Other Productions of same title
> - **Share:** Tap share on any show to generate a native score card image and open the iOS share sheet (no sign-in required)
>
> **Data source:** Show data is fetched as JSON from our CDN at broadwayscorecard.com/data and rendered entirely in native components. User data (ratings, watchlist, lists) is stored in Supabase. No WebView in the app.
>
> **Technical stack:** Expo SDK 54, React Native 0.81, React 19, Supabase Auth, Sentry for crash reporting, expo-notifications for push, expo-apple-authentication + @react-native-google-signin/google-signin for auth, react-native-reanimated for animations, expo-haptics for feedback.
>
> **Previous rejection context:** The 2026-03-10 rejection under 4.2.2 was accurate for that submission — a feature flag was disabling the account-based tabs. That flag is now enabled and this build includes the full native experience plus ~15 new features added since then.
>
> Support: tom@broadwayscorecard.com

---

## Resolution Center reply (paste into Resolution Center in ASC)

> Hello App Review Team,
>
> Thank you for the feedback on Broadway Scorecard. We understood the concern and this resubmission addresses Guideline 4.2.2 directly.
>
> **Native features in this build — immediately visible without any sign-in:**
> - Native fuzzy search across 700+ shows (Fuse.js), with haptic filter pills and a market picker (Broadway / Off-Broadway / West End)
> - Home tab shelves: Featured Carousel, Closing Soon with countdown badges, Tony Winners, NYT Critic's Picks carousel, Other Productions
> - Theater Seating Guide (interactive visualization on each show)
> - Video Reviews carousel (native video playback)
> - Social Scorecard (Reddit/social sentiment aggregation)
> - Native share sheet with generated score card images
> - Push notifications for show openings (opt-in)
>
> **Personal features — after sign-in (see demo account below):**
> Haptic-feedback star rating with 0.5-star gesture precision, personal diary (Watched tab), watchlist (To Watch tab with grid/list toggle), custom ranked lists (Lists tab), per-show ratings with notes — all synced to the user's account via Supabase.
>
> **🔑 Demo account** (pre-seeded with 5 rated shows, 3 watchlist entries, 1 ranked custom list):
> - Email: reviewer@broadwayscorecard.com
> - Password: BwayReview2026!
>
> **4-step reviewer flow:**
> 1. On any show, tap a star icon, OR tap the Watched / To Watch / Lists tab
> 2. On the Sign In sheet, tap "Sign in with email" (link below the Google/Apple buttons)
> 3. Enter the credentials above
> 4. Explore the pre-seeded personal features — tap a rating to change it, tap bookmark to add/remove from watchlist, tap the list to reorder
>
> **The previous rejection was accurate for that submission.** A feature flag in our app config (`userAccounts`) was disabled, which hid three entire tabs (Watched, To Watch, Lists) from the tab bar. That flag is now enabled, we added email/password sign-in specifically to make App Review smoother, and this build includes many new native features added since March.
>
> **Stack:** Expo SDK 54, React Native 0.81, React 19. All screens render in native components (FlatList, Pressable, react-native-reanimated Animated views, expo-haptics). There is no WebView in the app. Show data is fetched as JSON from our CDN and rendered natively. Crash reporting via Sentry.
>
> [SCREEN_RECORDING_URL_HERE if you decide to attach one — replace or remove this line]
>
> We appreciate your re-review. Please let us know if you would like any additional information.
>
> Best regards,
> Thomas Pryor
> Broadway Scorecard

---

## Version bump

**Recommendation: bump to 1.1.0.** The scope of changes since v1.0 (email sign-in, ~15 new features, feature flag flip) warrants it and gives the reviewer a visible "this is different" signal. Edit `~/BroadwayScorecard-app/app.json` → `"version": "1.1.0"` before the build.

---

## Ready-to-run commands

```bash
# 1. Verify agreement cleared (already done — API returned 200 ✅)

# 2. Bump version
# Edit ~/BroadwayScorecard-app/app.json → "version": "1.1.0"

# 3. (Re-run seed script if needed to reset demo account state)
SUPABASE_SERVICE_ROLE_KEY='<fetch from Supabase dashboard or GH secrets>' \
  node ~/BroadwayScorecard-app/scripts/seed-reviewer-account.js

# 4. Build + auto-submit to TestFlight
cd ~/BroadwayScorecard-app
eas build --platform ios --profile production --non-interactive --auto-submit

# 5. Once TestFlight processes (~15 min), submit to App Review via ASC UI:
#    - Add build to "iOS App Version 1.1.0"
#    - Paste App Review Notes (above)
#    - Submit for Review
#    - Reply in Resolution Center with text above

# 6. Monitor status via API:
cd ~/Broadwayscore && node scripts/asc-review-status.js
```

---

## (Optional) Screen recording

A 60-second screen recording of the demo-account sign-in + rating flow materially strengthens the case. See `screen-recording-script.md` in this directory for the scene-by-scene script.

Workflow:
1. On your iPhone, open Control Center → long-press Screen Recording → turn on Microphone (if you want narration) or leave off
2. Tap Record, open Broadway Scorecard, run through the script
3. Stop recording; open the video in Photos
4. Share → YouTube → Upload as **Unlisted**
5. Replace `[SCREEN_RECORDING_URL_HERE]` in the Resolution Center reply above with the YouTube URL
