import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "@/src/theme";

// Lightweight skeleton shown instantly on app start (instead of a spinner)
// while local state + first data load settle. Mirrors the Home layout so the
// transition into the real screen is seamless.
export function HomeSkeleton() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]} testID="home-skeleton">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.bar, { width: "55%" }]} />
          <View style={[styles.bar, { width: "75%", height: 10 }]} />
        </View>
        <View style={styles.pill} />
      </View>

      {/* Banner */}
      <View style={styles.banner} />

      {/* Segmented */}
      <View style={styles.segmented} />

      {/* Hero card */}
      <View style={styles.hero} />

      {/* Games grid */}
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.card} />
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface, paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 16 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surfaceTertiary },
  bar: { height: 14, borderRadius: 7, backgroundColor: c.surfaceTertiary },
  pill: { width: 84, height: 34, borderRadius: 999, backgroundColor: c.surfaceTertiary },
  banner: { height: 130, borderRadius: 20, backgroundColor: c.surfaceTertiary, marginTop: 8 },
  segmented: { height: 48, borderRadius: 999, backgroundColor: c.surfaceTertiary, marginTop: 16 },
  hero: { height: 150, borderRadius: 24, backgroundColor: c.surfaceTertiary, marginTop: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 22 },
  card: { width: "48%", height: 150, borderRadius: 20, backgroundColor: c.surfaceTertiary },
}));
