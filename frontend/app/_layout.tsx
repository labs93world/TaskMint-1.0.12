import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { UserProvider, useUser } from "@/src/context/UserContext";
import { ToastProvider } from "@/src/components/ui/Toast";
import { NetworkGate } from "@/src/components/NetworkGate";
import { ForceUpdateGate } from "@/src/components/ForceUpdateGate";
import { initAds } from "@/src/ads";
import { AdGateProvider } from "@/src/components/ui/AdGate";
import {
  registerBackgroundSync,
  requestNotificationPermission,
  scheduleDailyReminder,
  scheduleEngagementReminders,
} from "@/src/lib/notifications";
import { registerForPush } from "@/src/lib/push";

LogBox.ignoreAllLogs(true);

// Notification setup must live at module scope (before any component), and is
// guarded so it never runs on web where the native module is absent.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  }).catch(() => {});
}

// Runs background reconciliation of the device's requests with Firestore and
// wires up notifications (permission, daily reminder, background sync, taps).
function ReconcileRunner() {
  const { reconcile, onboarded, deviceId } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!onboarded) return;
    reconcile();
    const interval = setInterval(reconcile, 30000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reconcile();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [reconcile, onboarded]);

  // Request notification permission + schedule the daily reminder + register
  // the periodic background sync, once the user is set up.
  useEffect(() => {
    if (!onboarded || Platform.OS === "web") return;
    (async () => {
      const { granted } = await requestNotificationPermission();
      if (granted) {
        // Local reminders — work offline / app killed / app never opened.
        await scheduleDailyReminder(); // daily reward reminder @ 2 AM
        await scheduleEngagementReminders(); // random daily nudge @ 5 PM
        // Register this device for remote FCM push so Cloud Functions can
        // deliver notifications even when the app is fully closed.
        await registerForPush(deviceId);
      }
      await registerBackgroundSync();
    })();
  }, [onboarded, deviceId]);

  // Warm + cold-start tap handlers: open the right screen when a notification
  // is tapped.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      url.startsWith("http")
        ? Linking.openURL(url).catch(() => {})
        : router.push(url as any);
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener((res) =>
      handle(res.notification.request.content.data),
    );
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        if (res) handle(res.notification.request.content.data);
      })
      .catch(() => {});
    return () => tapSub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    initAds();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <UserProvider>
                <ToastProvider>
                  <AdGateProvider>
                    <NetworkGate>
                      <ForceUpdateGate>
                        <ReconcileRunner />
                        <StatusBar style="dark" />
                        <Stack
                          screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: "#F4F5F9" },
                          }}
                        />
                      </ForceUpdateGate>
                    </NetworkGate>
                  </AdGateProvider>
                </ToastProvider>
              </UserProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
