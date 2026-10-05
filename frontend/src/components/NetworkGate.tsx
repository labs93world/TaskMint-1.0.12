import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Network from "expo-network";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";

// Online-only app: blocks the whole UI with a friendly screen when offline.
export function NetworkGate({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const state = await Network.getNetworkStateAsync();
      if (mounted.current) setOnline(!!state.isConnected && state.isInternetReachable !== false);
    } catch {
      if (mounted.current) setOnline(true);
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    const interval = setInterval(check, 6000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => {
      mounted.current = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [check]);

  if (online) return <>{children}</>;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="offline-gate">
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Icon name="wifi-slash" size={44} color={colors.error} weight="bold" />
        </View>
        <Text style={styles.title}>No internet connection</Text>
        <Text style={styles.subtitle}>
          TaskMint needs an active internet connection to work. Please reconnect
          and try again.
        </Text>
        <Button
          label={checking ? "Checking..." : "Try again"}
          onPress={check}
          loading={checking}
          testID="offline-retry"
          style={{ marginTop: 24, alignSelf: "stretch" }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.error + "1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  subtitle: {
    fontSize: 15,
    color: c.muted,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
}));
