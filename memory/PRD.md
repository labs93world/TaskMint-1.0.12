# TaskMint — Product Requirements

## Overview
TaskMint is a mobile rewards app (Expo + FastAPI + MongoDB) where users earn points
through tasks (check-in, spin, scratch, quizzes, surveys, watch & visit ads, install/sign-up
campaigns, **games**) and withdraw to UPI / bank (100 points = ₹1).

Imported from: https://github.com/93altaff/TaskMint-8-2

## Iteration 35 — Override freshness fix
- **Withdraw override freshness** — Withdraw screen now re-fetches `/auth/me` on every focus and applies the user's latest `custom_withdraw_amounts` and `custom_exchange_ratio` before rendering chips, preventing stale global chips after an admin override. First-withdrawal chip filtering also uses the fresh user record.

## Iteration 37 — Global NativeAd layout fix
- **Flexible ad container** — shared native/web ad components now stretch horizontally, use safe-area-aware bottom padding, have a minimum usable height, and grow into unused vertical space instead of collapsing or overflowing.
- **Game ad wrappers** — bottom ad wrappers on Tic-Tac-Toe, Tap Rush, Math Sprint, Higher/Lower, Memory Match, and Trivia now stretch/fill correctly so the shared ad can expand into blank space.
- **Daily Challenge clipping fixed** — content is scrollable and the empty spacer was removed, so the ad remains fully visible in the four-box state.
- **Empty Visit & Earn state** — now renders the same NativeAd placement instead of leaving the page without an ad.

## Iteration 36 — Campaign approval payout correction
- **No automatic withdrawal history** — campaign approvals now only credit the approved points. Full, partial, and zero-point approvals never create withdrawal records or withdrawal ledger transactions automatically.
- **Withdraw override freshness retained** — the Withdraw screen continues to load the user's latest custom chips/ratio on focus.

## Iteration 24 — Admin controls, partial approvals, native ad placement
- **Partial campaign approval flow** — admin can now use a new **"Approve…"** button next to Approve / Reject on every pending campaign completion. It opens a number-pad prompt where the admin can enter any value `0 → reward_points`.
  - `0 pts` → user gets no wallet credit and no withdrawal record.
  - Partial (e.g. 400 / 1000) → user gets only the approved 400 pts credited; no automatic withdrawal record.
  - Full approval (Approve button or `approved_points` == reward) credits the full reward; no withdrawal record.
- **Admin banners → Hide / Pin / Edit** — every banner row now has Edit (pencil), Pin/Unpin, Hide/Show and Delete actions. Pinned items float to the top, hidden items are excluded from the public `/api/banners` feed. Admins still see all items in the admin list with `PINNED` / `HIDDEN` badges. Tapping Edit pre-fills the form for in-place updates.
- **Admin campaigns → Hide / Pin / Edit** — same treatment for the Offerwall (`/admin/campaigns`). Same public-feed filtering and pinned-first sort. Edit pre-fills every field including category, difficulty, rules, telegram contact, both proof-field labels & placeholders.
- **New "Campaigns" category** added to the campaign create/edit form dropdown alongside Survey / Game / App Install / Sign-up / Video / Custom.
- **Profile → Quick Access** — Telegram Channel / Contact on Telegram / Contact for Business now hide the URL/handle text under the button title (only the button label is shown), matching how Privacy Policy & Terms already behave. Buttons remain visible and clickable.
- **Native ads in all 4 games** — `tic-tac-toe`, `memory-match`, `math-sprint`, `higher-lower` — `NativeAd` block moved from above the gameplay area to below the play area (just before `</SafeAreaView>`).

## Iteration 23 — Admin user-detail polish
- **Withdrawals filter chip** added to every "Transaction History" modal — admin → Withdrawals, admin → Campaign Tasks, and admin → Users now have a 4th "Withdrawals" chip alongside All / Games & Task / Campaigns that filters to only `source == "withdraw"` rows. Chip rows are horizontally scrollable so they don't overflow on smaller phones.
- **User detail → Withdraw history** now renders the proper data (was showing blank `₹`). Each row shows `₹{inr_amount} • {METHOD} • {Campaigns/Games & Task}`, the points, timestamp, destination (UPI id or bank holder + account), and rejection note (if any).
- **User detail → High-paying task history** now shows the user-submitted form fields (`form_field_1_value`, `form_field_2_value`) in the same proof-box style used on the admin approval card, plus the admin rejection note.
- **User detail "Total earned" tile replaced with "Stats" tile** that opens a comprehensive metrics sheet. New endpoint `GET /api/admin/users/{user_id}/stats` returns:
  - Days since signup, active days, current + longest streak
  - Available balance (pts + ₹) and total earned (pts + ₹)
  - Campaigns approved / pending / rejected, and earned points/₹ from campaigns
  - Earned points/₹ from Games & Tasks
  - Total referrals and referral earnings
  - Successful / pending / rejected withdrawal totals (pts + ₹)
- Position swap: top row is now Balance | Total withdrawn | Stats; bottom row remains Tasks done | Streak | Refer.

## Iteration 22 — Admin panel polish (wallet-aware adjust + mobile + filter chips)
- **Admin Adjust Points** now picks a wallet bucket: Games & Task or Campaigns. Backend updates the chosen `campaign_points` / `games_task_points` plus the legacy `points` field, and refuses under-zero ops with a clear "X pts available" message.
- **Admin Withdrawal cards** show the user's mobile number (one extra projection lookup keyed by user_id, no per-row queries).
- **Admin Campaign Approval cards** show the user's mobile number plus a new "View user's transaction history" button.
- **Transaction-history modals** (admin → Withdrawals, admin → Campaign Tasks, admin → Users) all now have a 3-chip filter row: All / Games & Task / Campaigns. `/api/admin/users/{user_id}/transactions` also accepts an optional `?category=` filter, and legacy rows without `category` are normalised to `games_task` server-side.

## Iteration 21 — Game ad-gating rewrite + Wallet split + Withdraw 2-source flow
- **All 4 mini-games** (Tic-Tac-Toe, Memory Match, Math Sprint, Higher-Lower) — daily limits removed. Each entry shows a rewarded ad → unlocks N chances (TTT=10, Memory=5, Math=10, HL=10). When the counter hits 0, another rewarded ad refills it (no daily cap).
- **Interstitial ad every 5 plays** in TTT + Higher-Lower (shared `useGameSession` hook tracks counters).
- **Win popup modal** on every game showing the points won (`+X pts`).
- **NativeAd above the fold** on every game screen (placed directly under the header, before any play UI).
- **Memory Match reward** → random 50–100 pts on completion (was move/time formula).
- **Math Sprint** → 20s total session, up to 20 questions. Tiered rewards: 10→150, 8→100, 6→50, 4→30, else 0.
- **Wallet split into two buckets**: `campaign_points` (earned from campaigns) + `games_task_points` (everything else). Migration runs on startup based on transaction history. Legacy `points` field stays in sync (= cp + gp).
- **Withdraw flow** → source picker modal shows two cards (Campaigns / Games & Task). Campaigns has free amount input (no minimum chips), Games & Task keeps existing amount chips. Each user limited to **2 withdrawals/day combined**. Withdrawal records carry `source`; admin panel and history show a "Campaigns" / "Games & Task" tag. Rejection refunds the SAME bucket.
- **Wallet tab transaction history** → 3 horizontal filter chips: All / Games & Task / Campaigns. Backend supports `?category=` query param.
- **Home** → "High Paying Tasks" relabelled to **"High Paying Campaigns"**.

Backend tests: **24/24 pass** (iter21_taskmint suite).

## Iteration 19 — 4 new games + Watch & Earn tuning
- **Watch & Earn**: cycle limit reduced from 20 → **5 watches per 6 hours**, reward range bumped from 20-50 → **50-100 points**.
- **Coin Mine** (Tap-to-Earn): 1000 energy bar regens 1/sec, 1 pt per tap, **200 pts/day cap**. `POST /api/games/coinmine/tap` accepts batched taps (≤100/req). Watch ad → instant refill (30-min cooldown).
- **Plinko**: 5 drops/day + 5 ad-refill drops. 11-slot reward grid `[200, 100, 50, 30, 50, 75, 50, 30, 50, 100, 200]`. Server-simulated 10-step path returned to client for animation.
- **Treasure Hunt**: 30-tile monthly map, reveal one tile/day for 30-100 pts (5% chance of 500 mega tile). Complete all 30 → +1000 bonus.
- **Higher or Lower**: 10 rounds/day + 10 ad-refill rounds. Card 1-13, predict next. Streak 3 → 30 pts, 5 → 75, 7 → 100. Cashout any time at streak ≥ 3.
- **Earn tab**: new 2×2 "Play & Earn" hero grid (4 colored cards) placed right after the Daily Check-in compact hero.

Backend tests: **15/15 pass** (iter19_games suite).


## Iteration 17 — gameplay tuning + tutorial polish + version footer
- **Spin & Scratch — Interstitial ad on claim** (`InterstitialAdModal`)
  instead of `RewardedAdModal`. Snappier UX, no "watch full ad" gate.
- **Reward range tightened to 30–100** for Spin, Scratch, Visit, Surveys
  and Quizzes (was 50–100). Server-side `random.randint(30, 100)` for all
  five endpoints, hint texts updated everywhere.
- **Watch & Earn → 6-hour sliding cycle** (was daily). 20 watches per
  6-hour window; backend stores `watch_cycle_started_at` + `watch_cycle_used`
  on the user, `/auth/me` exposes both. When the quota is exhausted the
  cycle-locked screen shows a live `HH:MM:SS` countdown that auto-refreshes
  the user when zero is hit.
- **Tutorial video** — fixed the extra black space below the player.
  Container now uses a dynamic 16:9 aspect ratio computed from the device
  width instead of a fixed `height: 220`.
- **Profile version footer** — `v1.0.0` is now visible (`theme.colors.muted`)
  and tappable: a tap opens the configured Play Store URL from `/api/version`
  (falls back to `play.google.com/store/apps/details?id=com.taskmint.app`).
  Long-press still triggers the secret admin login flow.

## Iteration 16 — APK fixes (anti-clone + tutorial video)
- **Tutorial video — inline playback restored** using
  `react-native-youtube-iframe` (the maintained wrapper around the official
  YouTube IFrame API in a WebView). Plays directly inside the app; if the
  uploader has "Allow embedding" disabled on YouTube Studio YouTube returns
  error 100 / 101 / 150 / 152 / 153 — we catch those codes and swap to a
  one-tap "Open in YouTube" fallback button so the user is never stuck.
  *Workaround for owners*: enable embedding on the source video in YouTube
  Studio → Details → Show More → "Allow embedding".
- **One-device-one-account (anti-clone)** — `/api/auth/device` now accepts
  optional `fingerprint` + `device_meta`. Frontend hashes
  brand+manufacturer+modelName+modelId+designName+productName+osBuildId+
  osInternalBuildId+totalMemory (via expo-device + expo-crypto SHA-256) and
  sends it on every login. Backend lookup order: exact device_id → matching
  fingerprint (clone/parallel-space detected, attach the new device_id to
  the existing account) → otherwise create new. Stored on the user as
  `device_fingerprint`, `device_ids[]`, `device_meta`. Verified end-to-end:
  a clone with a new device_id but identical fingerprint resolves to the
  original user_id.

## Iteration 15 — UX polish round
- Backend: new `POST /api/auth/admin-logout` demotes is_admin without dropping device session. Admin user-search now only matches `name` + `mobile_number` (removed user_id/email).
- Profile: visible `v1.0.0` text hidden (kept as transparent micro-text for crash-safety); long-press on profile card while admin → Alert confirm → instant demote; non-admin long-press still opens hidden admin login modal.
- Admin home: all 5 stat cards (Users / Active / Pending WD / Paid WD / Pending Tasks) are now tappable shortcuts.
- Quizzes screen: brought back the visible NativeAd alongside the interstitial after each quiz round and on daily-limit screen.
- Admin user search: placeholder & behavior changed to "Search by name or mobile number".
- Admin referral-settings: legacy 7/15-day input cards removed from UI — tiers + sharing-text remain.

## Iteration 14 — admin UI for the Round 13 backend
- New `/admin/version` screen: edit `latest_version`, `min_supported_version`, `play_store_url`, `force_update`, `release_notes`. Toggling force-update shows a warning banner before save.
- `/admin/referral-settings` extended with multi-tier editor (`Add tier` / per-row days+points / delete) and a `sharing_text` textarea (with `{code}` placeholder helper). Adding any tier overrides the legacy 7/15-day fields server-side.
- `/admin` home: new tile linking to `/admin/version`; `RefreshCw` icon top-right re-fetches admin stats.

## Iteration 13 — feature batch
1. **Tutorial video** — Replaced YouTube IFrame WebView with thumbnail + tap-to-open
   YouTube app/web (kills Android playback error 153).
2. **High-paying tasks** — sorted within each status group by `created_at` DESC (newest first).
3. **Earn tab** — refer card subtitle removed; new Refresh chip on Quick Tasks header.
4. **Refer screen** — full **Referral History** list with each invitee's name, streak,
   last check-in, and pay-out badge; sharing text now comes from admin-controlled
   `sharing_text` (with `{code}` substitution).
5. **Profile** — admin-login button hidden behind a long-press on the avatar card;
   profile card now shows the saved mobile number.
6. **Withdraw** — first-time mobile + confirm-mobile inputs; the new
   `POST /api/profile/mobile` endpoint persists the number; `POST /api/withdraw`
   now refuses if mobile_number is empty.
7. **Force update** — Admin can set latest/min app version via `PUT /api/admin/version`.
   On launch the FE compares `Application.nativeApplicationVersion` and renders the
   animated `UpdateGate` (with Play-Store deep link) when an update is required.
8. **Admin** — login expires after 6 hours (auto-demote on next request); admin's
   `referral_code` is permanently `ALTAF`; admin user-search supports mobile-number;
   referral settings now accept multi-tier `tiers: [{streak_days, points}]` plus an
   editable `sharing_text`.
9. **AdMob** — quizzes finish-flow now plays an interstitial (was a NativeAd).
10. **App icon** — replaced everywhere with the gold coin asset uploaded by user.
11. **Admin password rotated** to `9372@Altaf93`.

## Tech stack
- Frontend: Expo SDK 54, Expo Router 6, RN 0.81, TypeScript
- Backend: FastAPI + Motor (async MongoDB), Pydantic v2
- DB: MongoDB (local). Auto-seeds banners, campaigns, links, app_settings.
- Auth: anonymous device-login (Bearer in AsyncStorage) + admin email/password
  promotion (`POST /api/auth/admin-login`, expires after 6h).

## Auth credentials
See `/app/memory/test_credentials.md`.
