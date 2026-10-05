import React from "react";
import { Linking, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { getConfig } from "@/src/lib/firestore";

function isOlder(current: string, latest: string): boolean {
  const a = current.split(".").map((n) => parseInt(n, 10) || 0);
  const b = latest.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const current = Constants.expoConfig?.version ?? "1.0.0";

  const { data } = useQuery({
    queryKey: ["app-config"],
    queryFn: () => getConfig(),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const mustUpdate =
    !!data?.forceUpdate && !!data?.latestVersion && isOlder(current, data.latestVersion);

  if (!mustUpdate) return <>{children}</>;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} testID="force-update-gate">
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Icon name="refresh" size={44} color={colors.brand} weight="bold" />
        </View>
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.subtitle}>
          {data?.message || "A new version of TaskMint is available. Please update to continue."}
        </Text>
        <Button
          label="Update now"
          testID="force-update-button"
          onPress={() => {
            const url = data?.updateUrl || "https://play.google.com/store/apps/details?id=com.labs93world.taskmint";
            Linking.openURL(url).catch(() => {});
          }}
          style={{ marginTop: 24, alignSelf: "stretch" }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { flex: 1, backgroundColor: c.surface },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, textAlign: "center" },
  subtitle: { fontSize: 15, color: c.muted, textAlign: "center", marginTop: 10, lineHeight: 22 },
}));
