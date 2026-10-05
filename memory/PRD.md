# TaskMint — Product Requirements Document

## Original Problem Statement
Production-ready Android rewards app "TaskMint" (package com.labs93world.taskmint). Login → Home with 3 bottom tabs (Home, Wallet, Profile). Offerwall tasks + Play & Earn mini-games, wallet withdrawals (UPI/Bank), hidden admin panel, AdMob ads. Offline-first (data on device), online-only usage, global admin data + user requests on Firestore, IST timestamps, polished responsive UI.

## Architecture
- **Frontend:** Expo Router (React Native, SDK 57), file-based routing.
- **Global store:** Firebase Firestore (JS SDK) — project `taskmint-cfc5a`.
- **Local store:** on-device via `@/src/utils/storage` (AsyncStorage) — profile, points, transactions, game chances, daily check-in, local mirrors.
- **Ads:** `react-native-google-mobile-ads` (banner, app open, rewarded, rewarded interstitial) — native build only; no-op in Expo Go/web via `src/ads` native/web split.
- **Theme:** `src/theme.ts` tokens from design_guidelines (light, tactile/playful).
- Backend (FastAPI/Mongo) present but unused — app is client + Firestore.

## User Personas
- **Earner:** completes offerwall tasks + games, withdraws to UPI/Bank.
- **Admin:** manages banners/tasks, approves/rejects payouts & submissions, force-update.

## Core Requirements (static)
- 1000 points = ₹1; min withdrawal ₹20.
- Store user data on device; store only admin content + requests on Firestore.
- Internet required to use the app (NetworkGate).
- IST date/time everywhere.

## Implemented (2026-06)
- Login/onboarding (copy of reference screenshot) + Name/Mobile collection.
- Home: fixed header (avatar, Hello+name, points pill), banner carousel, Offerwall/Play&Earn segmented.
- Offerwall: task cards, task detail popup, proof submission → Firestore, local status mirror.
- Play & Earn: daily check-in (streak) + 5 games (Higher Lower, Memory Match, Tic-Tac-Toe, Tap the Coins, Solve & Earn) with chances system (rewarded ad +5), reward popups, rewarded interstitial every 2 claims.
- Wallet: balance card, UPI/Bank, amount chips, withdraw → Firestore payout request (points reserved, auto-refund on rejection), Transactions/Withdrawals history + View 10 more.
- Profile: profile card, Help(mailto)/Terms/Privacy, hidden admin access (long-press version → key "TaskMint000").
- Admin: dashboard (Users, Active Today, Payouts, Offerwall counts) + Manage (Banners, Offerwalls, Force update) + payout/offerwall review (approve/reject + reason, copy UPI).
- Approved submissions auto-credit points on the user's device via background reconciliation.
- AdMob fully wired with real unit IDs; banner shown above all 3 tabs.
- Terms & Privacy in-app pages; ForceUpdate gate; Offline gate.
- app.json: name TaskMint, package com.labs93world.taskmint, icon, AdMob App ID plugin.

## Backlog / Remaining
- **P0 (user action):** Open Firestore security rules so global features work live.
- **P1:** Native Android build to verify AdMob (banner/app-open/rewarded/interstitial).
- **P2:** Optional — migrate RN Web `shadow*`→`boxShadow` to silence web warnings; custom profile avatar upload.

## Next Tasks
1. User opens Firestore rules → re-test banners, offerwall tasks + proof submission, admin counts/review.
2. Deploy & generate Android build to validate ads on device.
