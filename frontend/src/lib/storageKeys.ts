// Local (on-device) storage keys. Everything about the user lives here.
export const KEYS = {
  deviceId: "tm_device_id",
  onboarded: "tm_onboarded",
  profile: "tm_profile", // { name, mobile, avatar }
  points: "tm_points", // number
  transactions: "tm_transactions", // earning history
  withdrawals: "tm_withdrawals", // local mirror of payout requests
  submissions: "tm_submissions", // local mirror of offerwall submissions
  dailyCheckin: "tm_daily_checkin", // { lastDate, streak }
  gameChances: "tm_game_chances", // { [gameId]: number }
  claimCount: "tm_claim_count", // number, for interstitial cadence
  creditedSubs: "tm_credited_subs", // string[] submission ids already credited
  refundedPayouts: "tm_refunded_payouts", // string[] payout ids already refunded
  welcomeShown: "tm_welcome_shown", // boolean, first-open ₹1 welcome bonus
  dailyReminder: "tm_daily_reminder", // boolean, local daily reminder scheduled
  notifiedPayouts: "tm_notified_payouts", // string[] "payoutId:status" already notified
  notifiedSubs: "tm_notified_subs", // string[] submission ids already notified (approved)
  seenTasks: "tm_seen_tasks", // string[] task ids already seen (new-task alerts)
  pushToken: "tm_push_token", // last FCM device token saved to Firestore (dedup)
} as const;
