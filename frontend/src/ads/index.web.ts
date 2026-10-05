// Web / preview no-op ads. Keeps the bundle free of the native AdMob module.
import React from "react";

export async function initAds() {}
export function showRewarded(): Promise<boolean> {
  return Promise.resolve(true);
}
export function showRewardedInterstitial(): Promise<boolean> {
  return Promise.resolve(true);
}
export function AdBanner(): React.ReactElement | null {
  return null;
}
export const adsAvailable = false;
