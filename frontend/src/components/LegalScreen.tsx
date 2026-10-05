import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";

export function LegalScreen({
  title,
  sections,
}: {
  title: string;
  sections: { heading: string; body: string }[];
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} testID="legal-back">
          <Icon name="arrow-left" size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: June 2026</Text>
        {sections.map((s, i) => (
          <View key={i} style={{ marginTop: 20 }}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  updated: { fontSize: 13, color: c.muted, fontWeight: "600" },
  heading: { fontSize: 16, fontWeight: "800", color: c.onSurfaceSecondary, marginBottom: 8 },
  body: { fontSize: 14, color: c.onSurfaceTertiary, lineHeight: 22 },
}));
