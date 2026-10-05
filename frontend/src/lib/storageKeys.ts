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
} as const;
