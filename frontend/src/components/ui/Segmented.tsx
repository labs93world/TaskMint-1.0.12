import React from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { makeStyles } from "@/src/theme";

export type SegOption = { key: string; label: string; badge?: number };

export function Segmented({
  options,
  value,
  onChange,
  testID,
}: {
  options: SegOption[];
  value: string;
  onChange: (key: string) => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID={testID}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.key);
            }}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {o.label}
            </Text>
            {o.badge != null && o.badge > 0 && (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                  {o.badge}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    backgroundColor: c.surfaceSecondary,
    borderRadius: 999,
    padding: 6,
    gap: 6,
  },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pillActive: { backgroundColor: c.brandSecondary },
  label: { fontSize: 16, fontWeight: "800", color: c.onSurfaceSecondary },
  labelActive: { color: c.onBrandSecondary },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  badgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  badgeText: { fontSize: 12, fontWeight: "800", color: c.onSurfaceTertiary },
  badgeTextActive: { color: "#FFFFFF" },
}));
