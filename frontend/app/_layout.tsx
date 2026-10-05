import React, { useEffect } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { UserProvider, useUser } from "@/src/context/UserContext";
import { ToastProvider } from "@/src/components/ui/Toast";
import { NetworkGate } from "@/src/components/NetworkGate";
import { ForceUpdateGate } from "@/src/components/ForceUpdateGate";
import { initAds } from "@/src/ads";

LogBox.ignoreAllLogs(true);

// Runs background reconciliation of the device's requests with Firestore.
function ReconcileRunner() {
  const { reconcile, onboarded } = useUser();
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
                </ToastProvider>
              </UserProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
