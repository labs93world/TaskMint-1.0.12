# TaskMint — Remote Push Notifications (Firebase FCM)

Your app now sends **real remote push notifications through your own Firebase
project** (`taskmint-cfc5a`). Users receive them **even when the app is closed
or has never been opened** — because the sending happens on Firebase servers
(Cloud Functions), not on the phone.

There is **no Emergent server** involved. Everything is Firebase.

---

## How it works (two halves)

**1. The app registers each device (already built).**
When a user opens the app and allows notifications, the app grabs its FCM push
token and saves it on `users/{deviceId}.fcmToken` in Firestore.
Code: `frontend/src/lib/push.ts` (called from `frontend/app/_layout.tsx`).

**2. Cloud Functions send the pushes automatically (deploy once).**
The functions in `functions/index.js` watch Firestore and fire FCM pushes:

| Function | Fires when | Who gets it |
|----------|-----------|-------------|
| `onPayoutUpdate` | a withdrawal is set to **approved** / **rejected** | that one user |
| `onSubmissionUpdate` | an offerwall task is **approved** | that one user |
| `onNewTask` | you publish a **new offerwall task** | everyone |
| `dailyReminder` | **7:00 PM IST every day** (scheduled) | everyone |

All of this is automatic — once deployed you never send anything by hand.

---

## One-time deploy (you do this)

> ⚠️ Cloud Functions require the Firebase **Blaze (pay-as-you-go)** plan.
> It has a large free tier; you only pay if you exceed it. Upgrade at
> Firebase Console → ⚙️ → Usage and billing → Modify plan.

```bash
# 1. Install the Firebase CLI (once, on your computer)
npm install -g firebase-tools

# 2. Log in to the Google account that owns taskmint-cfc5a
firebase login

# 3. From the project root (where firebase.json lives)
cd functions && npm install && cd ..
firebase deploy --only functions
```

That's it. The four functions go live in your Firebase project.

Check they're sending:  `firebase functions:log`

---

## Important

- **Push only works on a real build**, not Expo Go or the web preview.
  Deploy the app with the **Publish** button (top-right) and generate an
  Android/iOS build. Then the device gets a real FCM token.
- `google-services.json` (already in `frontend/`) must match your Firebase
  Android app `com.labs93world.taskmint` — it does.
- To test: approve a withdrawal from the admin panel, or publish a new task —
  the push should arrive on a built device within seconds.
