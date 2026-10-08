# TaskMint — PRD

## Original Problem Statement
1. Import GitHub repo https://github.com/labs93world/TaskMint-1.0.11 (nothing missed).
2. (a) Home tab: remove "Open task link" button from offerwall task detail popup, keep only "Start task". (b) Profile tab: admin panel access password input must show text visibly while typing.
3. Explain (a) ads placement/working, (b) push notifications — tutor style.

## Architecture
- Expo (SDK 57) frontend, expo-router, React Query, Firebase JS SDK (Firestore) as the live datastore — all user/offerwall/payout data lives in user's Firebase project `taskmint-cfc5a`.
- FastAPI backend at /app/backend/server.py is the default template stub (no app logic there).
- Ads: react-native-google-mobile-ads (AdMob), wrapped in no-op for web/Expo Go (`src/ads/index.ts`).
- Notifications: 100% local (expo-notifications + expo-background-task), no FCM sender (`src/lib/notifications.ts`).

## Implemented (2026-10-06)
- Full repo import from GitHub → /app (rsync, preserved .env/.git/.emergent/node_modules; verified with diff — nothing missed).
- Removed "Open task link" button from `src/components/home/TaskDetailModal.tsx`.
- Removed `secureTextEntry` from admin key input in `app/(tabs)/profile.tsx` (text now visible while typing).
- **Remote push (FCM) — works when app is closed/never opened:**
  - Client: `src/lib/push.ts` grabs FCM device token, saves to `users/{deviceId}.fcmToken`; called from `app/_layout.tsx` after permission grant. `savePushToken()` added to `src/lib/firestore.ts`.
  - Sender: Firebase Cloud Functions in `/app/functions/index.js` (onPayoutUpdate, onSubmissionUpdate, onNewTask broadcast, dailyReminder 7PM IST). Deploy config `/app/firebase.json`, `/app/.firebaserc`, guide `/app/functions/README.md`.
  - Pure Firebase, no Emergent server. Requires Blaze plan + user runs `firebase deploy --only functions`. Push only works on a real native build.

## Deployment fix (2026-10-06)
- User's Emergent production deploy failed (BUILD FAILED: `git rev-parse` exit 128 in EAS workspace, `eas project:init failed`, no keystore).
- Root cause 1 (FIXED): imported repo's `.gitignore` had `.env`/`.env.*`/`*.env` → `frontend/.env` + `backend/.env` were never tracked, so the git-based deployment snapshot shipped with no env files. Removed patterns; committed both .env files.
- Root cause 2 (FIXED): `frontend/yarn.lock` missing → generated + committed (`--frozen-lockfile` builds).
- Verified by deployment_agent re-scan (dockerignore/yarn.lock blockers cleared) + testing_agent iteration_4 (all pass, no regressions).
- Remaining: deployment_agent policy flags Firebase-as-datastore (by design, kept). EAS keystore/git-root errors are pipeline-side — if they persist after redeploy, escalate to Emergent support.

## UI/Ads batch (2026-10-07)
- Login hero: text single-line auto-sized + allowFontScaling off + coins in corners → no overlap on large-font devices.
- Home header: compact (smaller avatar/fonts), points pill shows number only (removed " pts"), title auto-sizes.
- BannerCarousel: height ratio 0.46→0.375. Recommended banner image: 1200×450 px.
- PlayEarn: Daily Check-in card hidden once claimed today; games title/subtitle single-line auto-sized; rewarded-interstitial fires on claim.
- Wallet: removed purple balance card; balance now a top-right header pill `₹X.XX` (toFixed 2); tightened vertical spacing.
- Ads module (src/ads/index.ts) rewritten: App Open ad shows on EVERY open (cold start show-on-load + foreground resume); rewarded-interstitial now uses correct `RewardedInterstitialAd` class + preloading (ROOT CAUSE of 3e — old code wrongly used `RewardedAd` with the RI unit so it never loaded/showed in APK).
- Verified: testing_agent iteration_5, all 7 items pass, no regressions.

## Ads/Notifications/UX batch 2 (2026-10-08)
- App Open ad infinite-loop FIXED: added 30s cooldown + showing-guard so the ad's own background→foreground bounce no longer re-triggers it. Still shows on every genuine open (cold start + resume).
- Ad Gate (src/components/ui/AdGate.tsx): non-dismissable loader shown before rewarded/rewarded-interstitial; 5s cooldown for game get-chances, 3s for interstitial; on timeout/no-fill/network/unknown shows a detailed error with Try again / Cancel buttons. makeGatedAd uses correct RewardedAd vs RewardedInterstitialAd class per unit; web returns null → gate grants instantly.
- GameShell get-chances: synchronous useRef one-click guard (fixed +10 double-tap race). Interstitial fires via gate every INTERSTITIAL_EVERY claims, then reward popup.
- Daily check-in claim fires interstitial via gate.
- Banner: AdBanner renders zero-height until loaded (no white placeholder).
- Welcome popup: compact + single-line auto-sized title.
- App start: HomeSkeleton instead of spinner.
- Notifications: daily reward reminder moved to 2 AM; NEW engagement reminders — 20 rotating LOCAL messages scheduled 20 days ahead at 5 PM (random per day), offline/killed/never-opened safe, no server. scheduleEngagementReminders() re-tops the queue on every app open.
- Onboarding (details.tsx): added Password field (min 4, eye toggle) stored on users/{deviceId} in Firestore via ensureUser; title auto-sized.
- Verified: testing_agent iterations 6 + 7, all pass.

## Credentials
- Admin panel access key: `TaskMint000` (long-press version text on Profile tab to open hidden popup).

## Backlog
- P1: Move ADMIN_KEY out of client code (currently readable in bundle).
- P2: Version Pressable touch target ~35px (<44px guideline) — acceptable for hidden affordance.
