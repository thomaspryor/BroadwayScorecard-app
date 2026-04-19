# Resubmission for Guideline 4.2.2 Rejection

**Context:** v1.0 (build 48) was rejected 2026-03-10 on iPad Air 11-inch (M3) under Guideline 4.2.2 (Design: Minimum Functionality). Reviewer text: "the app only includes links, images, or content aggregated from the Internet with limited or no native functionality... does not sufficiently differ from a web browsing experience."

**Why it got rejected:** At submission, `features: ""` was set in `app.json` — the `userAccounts` feature flag was OFF. My Shows, watchlist, ratings, and lists tabs all showed empty sign-in CTAs. The reviewer saw a browse/search experience against our own CDN data — close to what Apple considers a web wrapper.

**What's different now:**
- `userAccounts` flag is ON → watchlist, diary, ratings, lists, and sharing all visible without sign-in prompts blocking them
- Sentry crash reporting live; push notifications registered on launch
- Tons of native-only features added since March (see below)

---

## Submission ID for Resolution Center reply
`99077a80-4dc5-496d-a5f6-d42aea4c07c5`

---

## App Review Notes (paste into ASC Version → App Review Information → Notes)

> Broadway Scorecard is a native iOS app built with React Native. It is NOT a web view wrapper and does not embed a browser.
>
> **Native interactivity (not available in a browser):**
> - **Personal diary & ratings** — users rate shows with a haptic-feedback star rating (0.5-star precision via gesture), adding personal reviews with mood, rewatchability, and notes. Data syncs to their account via Supabase.
> - **Watchlist** — tap the bookmark icon to save shows to "To Watch"; rated shows auto-move to "Watched." Grid + list view toggle.
> - **Custom Lists** — users can create and organize shows into personal lists.
> - **Native search** — fuzzy search with Fuse.js across 700+ shows, haptic-feedback filter pills, market picker (Broadway / Off-Broadway / West End).
> - **Score cards as shareable images** — tap share to generate a native image and open iOS share sheet.
> - **Push notifications** — opt-in alerts for new openings, rating prompts.
> - **Apple Sign-In + Google Sign-In** — native authentication via expo-apple-authentication.
> - **Sentry crash reporting** — native SDK for production stability.
> - **Theater seating guide, Social Scorecard, Video Reviews, Tony Awards carousel, NYT Critic's Picks carousel** — all native horizontal carousels with haptic scroll.
>
> **Data source:** Show data is fetched as JSON from our CDN and rendered entirely in native React Native components (FlatList, Pressable, SwiftUI-compatible Animated views). There is no WebView in the app.
>
> **Account required?** No — browsing, searching, market switching, and share cards all work without sign-in. Sign-in unlocks personal diary, watchlist, and lists.
>
> **Demo account:** Not needed. Create a new account via Apple Sign-In on the device to explore the personal features.
>
> Support: tom@broadwayscorecard.com

---

## Resolution Center reply (paste into Resolution Center in ASC)

> Hello App Review Team,
>
> Thank you for the feedback on Broadway Scorecard. We've addressed the Guideline 4.2.2 concern with this resubmission.
>
> The previous build had a feature flag that disabled our account-based native features (diary, watchlist, lists, ratings). That flag is now enabled. In this build you will see the full native experience:
>
> 1. **Native star rating with haptic feedback and half-star gesture precision** — users rate shows they've seen; ratings sync to their account and populate a personal Diary tab.
> 2. **Watchlist** — a persistent bookmark that lives in a "To Watch" tab with grid/list toggle. Moves to "Watched" when rated.
> 3. **Custom Lists** — users create personal lists like "Must See This Season" and add shows via a native sheet.
> 4. **Share score cards** — tap share on any show to generate a native image and open the iOS system share sheet.
> 5. **Push notifications** — opt-in alerts for show openings and rating prompts (expo-notifications).
> 6. **Apple Sign-In** — native authentication via expo-apple-authentication.
> 7. **Additional native features since v1.0 submission:** Tony Awards carousel, NYT Critic's Picks carousel, Theater Seating Guide, Social Scorecard, Video Reviews carousel, home screen date subtitles, market picker (Broadway / Off-Broadway / West End).
>
> The app is built with React Native (Expo SDK 54). All screens render in native components — FlatList for lists, Pressable/Haptics for interactions, react-native-reanimated for animations. There is no WebView in the app; show data is fetched as JSON from our CDN and rendered natively.
>
> Browsing and search work without an account. Sign-in is optional and unlocks the personal features above. To explore the personal features, sign in with Apple on the review device.
>
> Please let us know if you need any additional information.
>
> Best regards,
> Thomas Pryor
> Broadway Scorecard

---

## Recommended version bump
Currently: `version: "1.0.0"` in app.json. EAS auto-increments the build number, so resubmission at 1.0.0/build 50+ will work. However, given the scope of new features since March, bumping to **1.1.0** makes the change history clearer and gives reviewers a visual cue this is substantially different. Either works for Apple's gate.

---

## Ready-to-run commands (when agreement signed)

```bash
# 1. Verify agreement cleared
node -e "$(cat <<'EOF'
const crypto=require('crypto'),fs=require('fs'),https=require('https');
const h=Buffer.from('{"alg":"ES256","kid":"7MPPJ2254M","typ":"JWT"}').toString('base64url');
const p=Buffer.from(JSON.stringify({iss:'2d03cc88-e016-4fb7-8d89-a70a4a912875',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1200,aud:'appstoreconnect-v1'})).toString('base64url');
const k=crypto.createPrivateKey(fs.readFileSync(process.env.HOME+'/.keys/AuthKey_7MPPJ2254M.p8'));
const s=crypto.sign(null,Buffer.from(h+'.'+p),{key:k,dsaEncoding:'ieee-p1363'}).toString('base64url');
https.get({hostname:'api.appstoreconnect.apple.com',path:'/v1/apps/6760090370?fields[apps]=name',headers:{Authorization:'Bearer '+h+'.'+p+'.'+s}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('Status:',r.statusCode,d.slice(0,200)))});
EOF
)"

# 2. (Optional) bump version
# Edit ~/BroadwayScorecard-app/app.json → "version": "1.1.0"

# 3. Build + auto-submit to TestFlight
cd ~/BroadwayScorecard-app
eas build --platform ios --profile production --non-interactive --auto-submit

# 4. Once TestFlight processes (~15 min), submit to App Review via ASC UI:
#    - Add build to "iOS App Version 1.0" (or 1.1.0 if bumped)
#    - Paste App Review Notes (above)
#    - Submit for Review
#    - Reply in Resolution Center with text above

# 5. Monitor status via API:
cd ~/Broadwayscore && node scripts/asc-review-status.js
```
