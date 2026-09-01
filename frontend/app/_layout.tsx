import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "../src/context/AuthContext";
import NoInternetGate from "../src/components/NoInternetGate";
import { Toaster } from "sonner-native";
import { loadAdSettings } from "../src/lib/adConfig";
// Metro picks initAdMob.web.ts on web (no-op) and initAdMob.ts on native (real init).
import "../src/lib/initAdMob";

// Keep the native splash visible immediately on cold start so users see the
// branded splash from the very first frame (no white flash). It is hidden
// only after AuthContext has finished its initial token check.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Root layout. UpdateGateWrapper and MaintenanceGate have been intentionally
 * removed from this layout per product requirements — no force-update or
 * maintenance interstitials are shown to users. The UI components still live
 * in src/components/ in case they need to be re-enabled later.
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
