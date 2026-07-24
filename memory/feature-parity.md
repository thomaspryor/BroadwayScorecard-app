# Feature Parity Tracker: Web → iOS App

Last audited: 2026-07-24 (owner bug report session — 11 fixes shipped, gaps re-swept vs web May–Jul commits)

## How This Works
- **Web sessions**: After shipping a user-facing feature, add a row to "Needs App Implementation" (see web `/wrap-up` Phase 2.5).
- **App sessions**: Check this file at session start (CLAUDE.md rule 8). Pick up P0/P1 items when relevant.
- **Moving items**: When app implements a feature, move its row to "Implemented."

---

## Needs App Implementation

| Feature | Pri | Flagged | Notes |
|---|---|---|---|
| "Tix on sale" badge on watchlist posters | P1 | 2026-07-24 | Needs `ticketsOnSale` (+ ideally `previewDate`) added to mobile-shows.json export in web repo, then 3-line change in `statusOverlay()` in `app/(tabs)/to-watch.tsx`. All other status labels shipped 2026-07-24. |
| Edit rating from diary entry | P1 | 2026-07-24 | Web: grid edit pencil + `?edit=1` (`d2035b21daa`). App: tapping a diary entry goes to the show page; no direct edit affordance. Pass `reviewId` to `/rate/[showId]` from diary cells. |
| In-place planned-date prompt on watchlist add | P1 | 2026-07-24 | Web: "Seeing it when? [Add date] [Skip]" on quick-add (`e7c495c8589`). App adds silently; date only settable via long-press (undiscoverable). |
| Watchlist restructure: Not Yet Booked section + local-time boundary | P2 | 2026-07-24 | Web `b6085579e45`: Upcoming / Not Yet Booked / To Be Rated; date boundary local-time. App's boundary already fixed to local (2026-07-24) but has no Not Yet Booked split. |
| Import from Show Score | P2 | 2026-07-24 | Web `187f8601e30`. Pairs with Mezzanine import row below. |
| Mezzanine import (+ Find-it live lookup) | P1 | 2026-03-07 | Web: `MezzanineImport.tsx` + phase 2 date-aware matching (`992f58bc046`) + live Mezzanine Find-it (`8933a80ea6b`). Import diary from Mezzanine JSON. File picker + fuzzy match. |
| Fantasy Broadway | P2 | 2026-04-19 | Web: `/fantasy/`. Multiple leagues, share links, draft page. Probably web-only for now. |
| Lotteries directory | P2 | 2026-03-07 | Web: `app/lotteries/`. List of lottery-eligible shows with links. |
| Rush tickets directory | P2 | 2026-03-07 | Web: `app/rush/`. List of rush-eligible shows with links. |

## Implemented (Parity Achieved)

| Feature | App Files | Shipped |
|---|---|---|
| Browse with filters (status, type, sort) | `app/(tabs)/browse.tsx` | 2026-03 |
| Market picker (NYC, London) | `components/MarketPicker.tsx` | 2026-03 |
| Score toggle (critics/audience) | `components/ScoreToggle.tsx` | 2026-03 |
| Search | `app/(tabs)/search.tsx` | 2026-03 |
| Show detail (reviews, cast, tickets) | `app/show/[slug].tsx` | 2026-03 |
| Star ratings + diary (CRUD) | `app/rate/[showId].tsx`, `ShowPageRating.tsx` | 2026-03 |
| Watchlist with planned dates | `components/user/WatchlistButton.tsx` | 2026-03 |
| Deferred auth flow | `lib/deferred-auth.ts` | 2026-03 |
| My Shows (Diary + Watchlist tabs) | `app/(tabs)/my-shows.tsx` | 2026-03 |
| Share show | `app/show/[slug].tsx` | 2026-03 |
| Home with featured carousels | `app/(tabs)/index.tsx` | 2026-03 |
| Off-Broadway + West End | via market picker + CDN data | 2026-03 |
| Push notifications | `lib/local-notifications.ts` | 2026-03 |
| Deep linking | `app.json` config | 2026-03 |
| Rating Modal | `app/rate/[showId].tsx` | 2026-03 |
| User Lists (CRUD, ranked/unranked, reorder) | `components/user/ListsTab.tsx`, `hooks/useUserLists.ts` | 2026-03 |
| Add-to-list from show page | `components/user/AddToListSheet.tsx`, `ShowPageRating.tsx` | 2026-03 |
| NYT Critic's Picks carousel | `app/(tabs)/index.tsx` | 2026-04 |
| Other Productions shelf | `app/show/[slug].tsx` | 2026-04 |
| Social Scorecard | `app/show/[slug].tsx`, `lib/api.ts` | 2026-04 |
| Seating Guidance | `app/show/[slug].tsx`, CDN show detail | 2026-04 |
| Theater Scorecard | `app/show/[slug].tsx`, CDN show detail | 2026-04 |
| Video Reviews | `app/show/[slug].tsx`, CDN show detail | 2026-04 |
| Home carousel date subtitles (Coming Up) | `app/(tabs)/index.tsx`, `components/FeaturedCarousel.tsx` | 2026-04 |

## Web-Only (Not Planned for App)

Content-heavy reference pages — users access via web links from the app.

- Critic/Cast/Creative detail pages
- Tony Awards hub & predictions
- Rankings & show comparisons
- Commercial/box office hub
- Guides & methodology
- Review index & Gold Lists
- Theater map & audience buzz
- Beat the Critics (prototype only)
