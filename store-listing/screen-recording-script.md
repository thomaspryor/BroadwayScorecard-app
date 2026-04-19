# Screen Recording Script — App Review 4.2.2 Resubmission

**Goal:** 45-75 second video demonstrating native interactivity Apple reviewers might not experience during their review.

**Pre-recording setup:**
- Use a device running the current build (TestFlight or local)
- Log OUT of any signed-in account (Settings → Sign Out) so the demo starts from a fresh unsigned state
- Close the app and reopen so you start at the Home tab
- Put phone in Do Not Disturb so notifications don't interrupt
- Portrait orientation (iOS App Review prefers portrait)

**How to record:** Control Center → long-press Screen Recording icon → turn Microphone ON (for narration) or OFF (for silent) → tap Record. iPhone gives a 3-second countdown then records. Tap the red status bar or Control Center to stop.

**Target length:** 60 seconds. If you go over 90 you're over-explaining.

---

## Scene 1 — Home tab shelves (0:00–0:10)

**Action:** App opens on Home tab. Slowly scroll down to show:
- Featured Carousel
- Top Shows
- Closing Soon (with countdown badges)
- Tony Winners
- NYT Critic's Picks carousel
- Horizontal scroll one of the carousels to show the native haptic feel

**Optional narration:** "Home tab has multiple native carousels — Featured, Closing Soon, Tony Winners, NYT Critic's Picks."

---

## Scene 2 — Browse tab native search (0:10–0:20)

**Action:**
- Tap Browse tab
- Type "hamil" in the search field — show fuzzy match results
- Tap a filter pill (Musicals / Plays) — show haptic-feedback toggle
- Tap the market picker and switch Broadway → West End — show live filter

**Optional narration:** "Fuzzy search, filter pills with haptics, and a market picker for Broadway, Off-Broadway, and West End."

---

## Scene 3 — Show detail with non-auth features (0:20–0:35)

**Action:**
- Tap into a show (pick one with good data like Giant or Death of a Salesman)
- Scroll down slowly to show:
  - Score breakdown bars
  - Review excerpts
  - Theater Seating Guide (tap to show interactive part)
  - Video Reviews carousel
  - Social Scorecard
  - Cast & Creative

**Optional narration:** "Show detail includes native components for score breakdown, Theater Seating Guide, Video Reviews, and Social Scorecard — none of this is a WebView."

---

## Scene 4 — Sign in with demo account (0:35–0:45)

**Action:**
- On the show detail page, tap a star
- Sign In sheet appears
- Tap "Sign in with email" (the text link below Google/Apple)
- Enter `reviewer@broadwayscorecard.com` and `BwayReview2026!`
- Tap Sign In

**Narration:** "I'll sign in with the demo account to show the personal features."

---

## Scene 5 — Native personal features (0:45–1:00)

**Action:**
- After sign-in, drag the star to 4.5 — show half-star gesture + haptics
- (Optional) Add a note to the rating
- Tap the Watched tab — show 5 pre-seeded rated shows
- Tap the To Watch tab — show 3 saved shows
- Tap the Lists tab — show "Must See This Season" list with 3 ranked items

**Optional narration:** "Native star rating with haptic 0.5-star gestures, a personal diary, a watchlist, and custom ranked lists — all synced to Supabase."

---

## Scene 6 — Close / upload

Stop recording. The video will be in Photos.

**To upload:**
1. Open the video in Photos → tap Share → **YouTube**
2. Sign in with your YouTube account
3. Set **Visibility: Unlisted** (important — not Public)
4. Title: "Broadway Scorecard — App Review 4.2.2 Resubmission Demo"
5. Description: Paste the Resolution Center reply URL fragment if you want, or leave blank
6. Copy the YouTube URL
7. Paste into `store-listing/resubmission-4.2.2.md` → Resolution Center reply → replace `[SCREEN_RECORDING_URL_HERE]`

---

## Backup: no-audio version

If you don't want to narrate, skip the narration prompts. A silent video is fine — App reviewers will watch with captions/subtitles off anyway.

---

## If something goes wrong

- **App crashes mid-recording:** Restart recording from scratch. Apple reviewers notice sloppy edits.
- **Wrong data appears:** Re-run `scripts/seed-reviewer-account.js` to reset the demo account state.
- **Sign-in fails:** Confirm you built the latest commit with email sign-in. The "Sign in with email" link only exists in builds ≥ commit `f2051c6`.
