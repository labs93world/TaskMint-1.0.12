/**
 * TaskMint — Firebase Cloud Functions (remote push sender).
 *
 * These run INSIDE your own Firebase project (taskmint-cfc5a). They listen to
 * Firestore changes and send FCM push notifications automatically — so users
 * receive them even when the TaskMint app is fully closed or never opened.
 *
 * No Emergent / external server is involved. Everything is Firebase.
 *
 *  • onPayoutUpdate      -> withdrawal approved / rejected
 *  • onSubmissionUpdate  -> offerwall task approved
 *  • onNewTask           -> new offerwall task published (broadcast to everyone)
 *  • dailyReminder       -> scheduled 7:00 PM IST reminder (broadcast)
 *
 * Deploy:  cd functions && npm install && firebase deploy --only functions
 * (Requires the Firebase CLI logged in to project taskmint-cfc5a and the
 *  pay-as-you-go "Blaze" plan — Cloud Functions require it.)
 */

const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");

initializeApp();
const db = getFirestore();

// ----------------------------- helpers --------------------------------------
function rupees(n) {
  const v = Number(n) || 0;
  return "\u20B9" + v.toLocaleString("en-IN");
}

// Send one push to a single device token.
async function sendToToken(token, title, body, deeplink) {
  if (!token) return;
  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data: { deeplink: deeplink || "/(tabs)" },
      android: {
        priority: "high",
        notification: { channelId: "default", sound: "default" },
      },
      apns: { payload: { aps: { sound: "default" } } },
    });
  } catch (err) {
    logger.warn("sendToToken failed", { token: token.slice(0, 12), err: String(err) });
  }
}

// Look up a user's token by their deviceId (users doc id === deviceId).
async function tokenForDevice(deviceId) {
  if (!deviceId) return "";
  const snap = await db.collection("users").doc(deviceId).get();
  const data = snap.exists ? snap.data() : null;
  return data && data.pushEnabled !== false ? data.fcmToken || "" : "";
}

// Broadcast to every user that has push enabled (batched at 500 tokens).
async function broadcast(title, body, deeplink) {
  const snap = await db.collection("users").where("pushEnabled", "==", true).get();
  const tokens = [];
  snap.forEach((d) => {
    const t = d.data().fcmToken;
    if (t) tokens.push(t);
  });
  if (!tokens.length) return;

  const message = {
    notification: { title, body },
    data: { deeplink: deeplink || "/(tabs)" },
    android: { priority: "high", notification: { channelId: "default", sound: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    try {
      await getMessaging().sendEachForMulticast({ ...message, tokens: batch });
    } catch (err) {
      logger.warn("broadcast batch failed", { err: String(err) });
    }
  }
  logger.info("broadcast sent", { count: tokens.length, title });
}

// ------------------------- Withdrawal status --------------------------------
exports.onPayoutUpdate = onDocumentUpdated("payout_requests/{id}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after || before.status === after.status) return;

  const token = await tokenForDevice(after.deviceId);
  if (!token) return;

  if (after.status === "successful") {
    await sendToToken(
      token,
      "Withdrawal approved \u2705",
      `Your ${rupees(after.amount)} withdrawal has been approved.`,
      "/(tabs)/wallet",
    );
  } else if (after.status === "rejected") {
    await sendToToken(
      token,
      "Withdrawal rejected",
      `Your ${rupees(after.amount)} withdrawal was rejected${after.reason ? ": " + after.reason : "."}`,
      "/(tabs)/wallet",
    );
  }
});

// ------------------------- Offerwall approval -------------------------------
exports.onSubmissionUpdate = onDocumentUpdated("offerwall_submissions/{id}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!before || !after || before.status === after.status) return;
  if (after.status !== "approved") return;

  const token = await tokenForDevice(after.deviceId);
  if (!token) return;

  await sendToToken(
    token,
    "Task approved \uD83C\uDF89",
    `You earned ${rupees(after.reward)} for "${after.taskTitle}".`,
    "/(tabs)/wallet",
  );
});

// ------------------------- New task broadcast -------------------------------
exports.onNewTask = onDocumentCreated("offerwall_tasks/{id}", async (event) => {
  const task = event.data.data();
  if (!task || task.hidden) return;
  await broadcast(
    "New task available \uD83C\uDD95",
    `${task.title} \u2014 earn ${rupees(task.reward)}. Tap to start!`,
    "/(tabs)",
  );
});

// ------------------------- Daily reminder (7PM IST) -------------------------
exports.dailyReminder = onSchedule(
  { schedule: "0 19 * * *", timeZone: "Asia/Kolkata" },
  async () => {
    await broadcast(
      "TaskMint \uD83C\uDF81",
      "Your daily reward is ready! Tap to claim your check-in and earn more.",
      "/(tabs)",
    );
  },
);
