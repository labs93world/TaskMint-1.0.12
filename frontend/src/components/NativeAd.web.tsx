import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../lib/theme";

export default function NativeAd({ testID = "native-ad" }: { testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.host, { paddingBottom: theme.spacing.md + insets.bottom }]} testID={testID}>
      <View style={styles.card}>
        <Text style={styles.label}>SPONSORED</Text>
        <Text style={styles.title}>TaskMint partners</Text>
        <Text style={styles.sub}>Native ads show in the installed app</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexGrow: 1,
    flexShrink: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 210,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  card: {
    flex: 1,
    width: "100%",
    minHeight: 178,
    backgroundColor: "#EEF1F6",
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: theme.spacing.md,
    overflow: "hidden",
  },
  label: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: theme.colors.muted },
  title: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  sub: { fontSize: 11, color: "#9CA3AF" },
});
