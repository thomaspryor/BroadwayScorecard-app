# Feature Parity Tracker: Web → iOS App

Last audited: 2026-08-03 (beta-feedback round 3, builds 69/70 — diary-catalog import merge shipped)

## How This Works
- **Web sessions**: After shipping a user-facing feature, add a row to "Needs App Implementation" (see web `/wrap-up` Phase 2.5).
- **App sessions**: Check this file at session start (CLAUDE.md rule 8). Pick up P0/P1 items when relevant.
- **Moving items**: When app implements a feature, move its row to "Implemented."

---

## Needs App Implementation

| Feature | Pri | Flagged | Notes |
|---|---|---|---|
| Edit rating from diary entry | P1 | 2026-07-24 | Web: grid edit pencil + `?edit=1` (`d2035b21daa`). App: tapping a diary entry goes to the show page; no direct edit affordance. Pass `reviewId` to `/rate/[showId]` from diary cells. |
| Diary-only show pages | P1 | 2026-08-03 | Imports now match the ~33k diary catalog (build 69), so a diary-only show_id can land in Watched/To Watch/Lists. Web resolves these at `/diary-show/[id]`; the app has no route, so tapping the row only toasts "isn't in the current catalog yet". Titles are cached (`lib/diary-titles.ts`) but there is nowhere to go. |
| Add-show search misses diary-only shows | P2 | 2026-08-03 | `ShowSearchModal` fuses `useShows()` only. The web's Add-show dropdown merges `diary-search.json` (`useShowSearch` `mergeDataUrl`). The loader already exists in the app (`lib/diary-catalog.ts`, used by import) — wire it in behind the same on-demand fetch so you can watchlist an Off-Broadway/regional show you can already import. |
| Import Find-it live lookup | P2 | 2026-07-24 | Web `8933a80ea6b`: per-row "find it" live Mezzanine catalog search for rows that miss the local match, writes a `user_show_stubs` row. Largely superseded by the diary-catalog merge (2026-08-03) — re-scope before starting: measure how many rows still miss now. |
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
| "Tix on sale" / full web status wording on watchlist posters | `components/show-cards/PosterStatusPill.tsx` | 2026-08-03 |
| In-place planned-date prompt on watchlist add | `components/user/PlannedDateSheet.tsx`, `app/(tabs)/to-watch.tsx` | 2026-08-03 |
| Watchlist restructure: Upcoming / Not Yet Booked | `app/(tabs)/to-watch.tsx` | 2026-08-03 |
| Import matches the diary catalog (web parity) | `lib/show-match.ts`, `lib/diary-catalog.ts`, `app/import.tsx` | 2026-08-03 |
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
| Mezzanine/Show Score import (date-aware matching, checkpointed bulk insert) | `app/import.tsx`, `lib/show-import.ts`, `lib/rating.ts` | 2026-07-24 |

## Web-Only (Not Planned for App)

- **Public/shareable lists** (share link, public toggle) — owner decision 2026-07-24 (Option B): skip on mobile until a real user asks; web share links open fine from the app.

Content-heavy reference pages — users access via web links from the app.

- Critic/Cast/Creative detail pages
- Tony Awards hub & predictions
- Rankings & show comparisons
- Commercial/box office hub
- Guides & methodology
- Review index & Gold Lists
- Theater map & audience buzz
- Beat the Critics (prototype only)
