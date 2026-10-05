// Native AdMob manager. Wrapped in try/catch so the app still runs in Expo Go
// / web preview where the native module is absent (ads simply no-op there).
import React from "react";
import { AppState, AppStateStatus } from "react-native";

import { AD_UNITS } from "@/src/constants/ads";

let GMA: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  GMA = require("react-native-google-mobile-ads");
} catch {
  GMA = null;
}

const available = !!(GMA && GMA.default);

let initialized = false;
let appOpenAd: any = null;
let appOpenLoaded = false;
let appOpenShowing = false;

function loadAppOpen() {
  if (!available) return;
  try {
    const { AppOpenAd, AdEventType } = GMA;
    appOpenAd = AppOpenAd.createForAdRequest(AD_UNITS.appOpen);
    appOpenLoaded = false;
    appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      appOpenLoaded = true;
    });
    appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      appOpenShowing = false;
      appOpenLoaded = false;
      loadAppOpen();
    });
    appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
      appOpenLoaded = false;
    });
    appOpenAd.load();
  } catch {
    // ignore
  }
}

function showAppOpen() {
  if (!available || !appOpenLoaded || appOpenShowing) return;
  try {
    appOpenShowing = true;
    appOpenAd.show();
  } catch {
    appOpenShowing = false;
  }
}

let appStateRef: AppStateStatus = "active";

export async function initAds() {
  if (!available || initialized) return;
  try {
    await GMA.default().initialize();
    initialized = true;
    loadAppOpen();
    // Show on cold start once the first ad is ready.
    setTimeout(showAppOpen, 1500);
    AppState.addEventListener("change", (next) => {
      const returning = /inactive|background/.test(appStateRef) && next === "active";
      appStateRef = next;
      if (returning) showAppOpen();
    });
  } catch {
    // ignore
  }
}

function showFullScreenRewarded(unitId: string): Promise<boolean> {
  if (!available) return Promise.resolve(true); // preview: grant immediately
  return new Promise((resolve) => {
    try {
      const { RewardedAd, RewardedAdEventType, AdEventType } = GMA;
      const ad = RewardedAd.createForAdRequest(unitId);
      let earned = false;
      let settled = false;
      const subs: (() => void)[] = [];
      const cleanup = () => subs.forEach((s) => s && s());
      const finish = (val: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      };
      subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show()));
      subs.push(
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
      );
      subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)));
      subs.push(ad.addAdEventListener(AdEventType.ERROR, () => finish(false)));
      ad.load();
      setTimeout(() => finish(earned), 30000);
    } catch {
      resolve(false);
    }
  });
}

export function showRewarded(): Promise<boolean> {
  return showFullScreenRewarded(AD_UNITS.rewarded);
}

export function showRewardedInterstitial(): Promise<boolean> {
  return showFullScreenRewarded(AD_UNITS.rewardedInterstitial);
}

export function AdBanner(): React.ReactElement | null {
  if (!available) return null;
  try {
    const { BannerAd, BannerAdSize } = GMA;
    return React.createElement(BannerAd, {
      unitId: AD_UNITS.banner,
      size: BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
    });
  } catch {
    return null;
  }
}

export const adsAvailable = available;
