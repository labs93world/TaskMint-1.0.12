// Native AdMob manager. Wrapped in try/catch so the app still runs in Expo Go
// / web preview where the native module is absent (ads simply no-op there).
import React from "react";
import { AppState, AppStateStatus, View } from "react-native";

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

export type AdType = "rewarded" | "rewardedInterstitial";
export type AdErrorKind = "network" | "no-fill" | "timeout" | "unknown";

export function classifyAdError(e: any): AdErrorKind {
  const s = ((e && (e.code || e.message)) || "").toString().toLowerCase();
  if (s.includes("network")) return "network";
  if (s.includes("no-fill") || s.includes("no fill") || s.includes("nofill")) return "no-fill";
  if (s.includes("timeout")) return "timeout";
  return "unknown";
}

// --------------------------- App Open ad ------------------------------------
// IMPORTANT: showing an App Open ad sends the host app to the background and
// then back to "active" when the ad is dismissed. Without a guard + cooldown
// that very transition re-triggers the ad, producing an endless chain of ads
// ("ads showing nonstop one by one"). We therefore: (a) never show while one is
// already showing, and (b) enforce a minimum gap between displays.
let appOpenAd: any = null;
let appOpenLoaded = false;
let appOpenShowing = false;
let appOpenShowOnLoad = false;
let appOpenLastShown = 0;
const APP_OPEN_MIN_GAP = 30_000; // ms between App Open displays

function loadAppOpen() {
  if (!available) return;
  try {
    const { AppOpenAd, AdEventType } = GMA;
    appOpenAd = AppOpenAd.createForAdRequest(AD_UNITS.appOpen);
    appOpenLoaded = false;
    appOpenAd.addAdEventListener(AdEventType.LOADED, () => {
      appOpenLoaded = true;
      if (appOpenShowOnLoad) {
        appOpenShowOnLoad = false;
        showAppOpen();
      }
    });
    appOpenAd.addAdEventListener(AdEventType.CLOSED, () => {
      appOpenShowing = false;
      appOpenLoaded = false;
      loadAppOpen(); // preload the next one so the next open can show it
    });
    appOpenAd.addAdEventListener(AdEventType.ERROR, () => {
      appOpenLoaded = false;
      appOpenShowing = false;
    });
    appOpenAd.load();
  } catch {
    // ignore
  }
}

function showAppOpen() {
  if (!available || appOpenShowing) return;
  // Rate-limit so the ad's own background→foreground bounce can't loop it.
  if (Date.now() - appOpenLastShown < APP_OPEN_MIN_GAP) return;
  if (!appOpenLoaded) {
    appOpenShowOnLoad = true;
    return;
  }
  try {
    appOpenShowing = true;
    appOpenLastShown = Date.now();
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
    // Cold start: show the App Open ad as soon as it is ready.
    showAppOpen();
    AppState.addEventListener("change", (next) => {
      const returning = /inactive|background/.test(appStateRef) && next === "active";
      appStateRef = next;
      // Guard + cooldown inside showAppOpen prevent the self-trigger loop.
      if (returning && !appOpenShowing) showAppOpen();
    });
  } catch {
    // ignore
  }
}

// --------------------------- Gated full-screen ads --------------------------
// Low-level handle used by the AdGate UI so it can own the loading / cooldown /
// error experience. Rewarded AND rewarded-interstitial use the correct class
// for their unit type (mixing them up makes the ad silently fail to load).
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

export function makeGatedAd(type: AdType, handlers: GatedHandlers): GatedAd | null {
  if (!available) return null;
  try {
    const { RewardedAd, RewardedInterstitialAd, RewardedAdEventType, AdEventType } = GMA;
    const unit = type === "rewarded" ? AD_UNITS.rewarded : AD_UNITS.rewardedInterstitial;
    const Ctor = type === "rewarded" ? RewardedAd : RewardedInterstitialAd;
    const ad = Ctor.createForAdRequest(unit, { requestNonPersonalizedAdsOnly: false });
    let shown = false;
    const subs: (() => void)[] = [];
    subs.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => handlers.onLoaded()));
    subs.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => handlers.onEarned()));
    subs.push(ad.addAdEventListener(AdEventType.CLOSED, () => handlers.onClosed()));
    subs.push(ad.addAdEventListener(AdEventType.ERROR, (e: any) => handlers.onError(classifyAdError(e), e)));
    return {
      load: () => {
        try {
          ad.load();
        } catch (e) {
          handlers.onError(classifyAdError(e), e);
        }
      },
      show: () => {
        try {
          if (!shown) {
            shown = true;
            ad.show();
          }
        } catch (e) {
          handlers.onError("unknown", e);
        }
      },
      destroy: () => subs.forEach((s) => s && s()),
    };
  } catch {
    return null;
  }
}

// --------------------------- Banner -----------------------------------------
// Renders nothing (zero height) until the banner has actually loaded, so there
// is no white placeholder box while it is loading or if it fails to fill.
export function AdBanner(): React.ReactElement | null {
  if (!available) return null;
  try {
    const { BannerAd, BannerAdSize } = GMA;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [loaded, setLoaded] = React.useState(false);
    return React.createElement(
      View,
      { style: { height: loaded ? undefined : 0, overflow: "hidden" } },
      React.createElement(BannerAd, {
        unitId: AD_UNITS.banner,
        size: BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
        onAdLoaded: () => setLoaded(true),
        onAdFailedToLoad: () => setLoaded(false),
      }),
    );
  } catch {
    return null;
  }
}

export const adsAvailable = available;
