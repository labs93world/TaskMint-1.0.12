import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Application from "expo-application";
import Constants from "expo-constants";
import appJson from "../app.json";
import { AuthProvider } from "../src/context/AuthContext";
import NoInternetGate from "../src/components/NoInternetGate";
import UpdateGateWrapper from "../src/components/UpdateGateWrapper";
import { api } from "../src/lib/api";
import { Toaster } from "sonner-native";
import { loadAdSettings } from "../src/lib/adConfig";
// Metro picks initAdMob.web.ts on web (no-op) and initAdMob.ts on native (real init).
import "../src/lib/initAdMob";

// Keep the native splash visible immediately on cold start so users see the
// branded splash from the very first frame (no white flash). It is hidden
// only after AuthContext has finished its initial token check.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout. The force-update gate (UpdateGateWrapper + UpdateGate) is wired
 * here: it fetches /api/version, compares the installed app version against the
 * admin-configured `latest_version`, and — when the app is outdated — shows the
 * update screen. If the admin turns ON `force_update`, the gate is a hard block
 * (no "Skip"); otherwise it is dismissible. Admins and the Profile route are
 * exempt (see UpdateGateWrapper) so admin can always sign in and toggle it off.
 */
export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setVisibilityAsync("hidden");
      } catch {}
    })();
  }, []);

  // Refresh AdMob unit IDs from the backend on cold start (admin can update them).
  useEffect(() => {
    loadAdSettings();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SplashGate />
          <NoInternetGate>
            <StatusBar style="dark" hidden />
            <UpdateGateHost>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F7F9FC" } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="auth-callback" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="withdraw" options={{ presentation: "card" }} />
              <Stack.Screen name="checkin" />
              <Stack.Screen name="spin" />
              <Stack.Screen name="scratch" />
              <Stack.Screen name="quizzes" />
              <Stack.Screen name="surveys" />
              <Stack.Screen name="watch-earn" />
              <Stack.Screen name="visit-earn" />
              <Stack.Screen name="offers" />
              <Stack.Screen name="task/[id]" />
              <Stack.Screen name="refer" />
              <Stack.Screen name="admin/index" />
              <Stack.Screen name="admin/banners" />
              <Stack.Screen name="admin/campaigns" />
              <Stack.Screen name="admin/withdrawals" />
              <Stack.Screen name="admin/links" />
              <Stack.Screen name="admin/users" />
              <Stack.Screen name="admin/campaign-completions" />
              <Stack.Screen name="admin/withdraw-settings" />
              <Stack.Screen name="admin/referral-settings" />
              <Stack.Screen name="admin/version" />
              <Stack.Screen name="admin/admob" />
              <Stack.Screen name="admin/settings" />
              <Stack.Screen name="admin/game-rewards" />
              <Stack.Screen name="admin/maintenance" />
              <Stack.Screen name="admin/profile-buttons" />
              <Stack.Screen name="higher-lower" />
              <Stack.Screen name="tap-rush" />
              <Stack.Screen name="trivia-streak" />
            </Stack>
            </UpdateGateHost>
          </NoInternetGate>
          <Toaster
            position="top-center"
            richColors
            closeButton
            theme="light"
            toastOptions={{ style: { borderRadius: 14 } }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Hides the OS/native splash immediately on the first JS frame so the branded
 * JS loading screen (app/index.tsx) becomes the only splash users perceive.
 * (Android 12+/iOS always show a brief OS splash that cannot be fully removed,
 * but releasing it on mount hands off to index.tsx instantly with no lingering
 * native splash and no white flash — both use the same #4F46E5 background.)
 */
function SplashGate() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return null;
}

/** Compare dotted version strings. Returns -1 if a<b, 0 if equal, 1 if a>b. */
function compareVersions(a: string, b: string): number {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

type VersionInfo = {
  latest_version: string;
  min_supported_version?: string;
  play_store_url: string;
  force_update: boolean;
  release_notes?: string;
};

/**
 * Fetches /api/version and decides whether to show the force-update gate.
 * `installed` = the true build version on device (expo-application) with a web
 * fallback to app.json version. Gate becomes active when installed < latest.
 * A build older than `min_supported_version` is always a hard block.
 */
function UpdateGateHost({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let alive = true;
    api<VersionInfo>("/version", { auth: false })
      .then((v) => { if (alive) setInfo(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const installed =
    Application.nativeApplicationVersion ||
    ((appJson as any)?.expo?.version as string) ||
    (Constants.expoConfig?.version as string) ||
    "0.0.0";

  const outdated = !!info && compareVersions(installed, info.latest_version) < 0;
  const belowMin =
    !!info && !!info.min_supported_version &&
    compareVersions(installed, info.min_supported_version) < 0;
  // Hard force when admin flag is on OR the build is below the minimum supported.
  const forceUpdate = !!info && (!!info.force_update || belowMin);
  const active = !!info && outdated && (forceUpdate || !skipped);

  return (
    <UpdateGateWrapper
      active={active}
      latestVersion={info?.latest_version || installed}
      playStoreUrl={info?.play_store_url || ""}
      forceUpdate={forceUpdate}
      releaseNotes={info?.release_notes}
      onSkip={() => setSkipped(true)}
    >
      {children}
    </UpdateGateWrapper>
  );
}
