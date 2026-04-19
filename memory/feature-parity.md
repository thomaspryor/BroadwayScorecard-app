# Feature Parity Tracker: Web → iOS App

Last audited: 2026-04-19

## How This Works
- **Web sessions**: After shipping a user-facing feature, add a row to "Needs App Implementation" (see web `/wrap-up` Phase 2.5).
- **App sessions**: Check this file at session start (CLAUDE.md rule 8). Pick up P0/P1 items when relevant.
- **Moving items**: When app implements a feature, move its row to "Implemented."

---

## Needs App Implementation

| Feature | Pri | Flagged | Notes |
|---|---|---|---|
| Mezzanine import | P1 | 2026-03-07 | Web: `MezzanineImport.tsx`. Import diary from Mezzanine JSON. File picker + fuzzy match. |
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
