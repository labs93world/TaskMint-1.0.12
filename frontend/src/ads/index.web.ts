// Web / preview no-op ads. Keeps the bundle free of the native AdMob module.
import React from "react";

export type AdType = "rewarded" | "rewardedInterstitial";
export type AdErrorKind = "network" | "no-fill" | "timeout" | "unknown";
export type GatedHandlers = {
  onLoaded: () => void;
  onEarned: () => void;
  onClosed: () => void;
  onError: (kind: AdErrorKind, raw?: any) => void;
};
export type GatedAd = {
  load: () => void;
  show: () => void;
  destroy: () => void;
};

export async function initAds() {}

export function classifyAdError(): AdErrorKind {
  return "unknown";
}

// No native ads on web — the AdGate treats a null handle as "grant immediately".
export function makeGatedAd(_type: AdType, _handlers: GatedHandlers): GatedAd | null {
  return null;
}

export function AdBanner(): React.ReactElement | null {
  return null;
}

export const adsAvailable = false;
