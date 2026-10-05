import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";

type Variant = "primary" | "secondary" | "tertiary" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const bg = {
    primary: colors.brandPrimary,
    secondary: colors.brandSecondary,
    tertiary: colors.surfaceTertiary,
    ghost: "transparent",
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    secondary: colors.onBrandSecondary,
    tertiary: colors.onSurfaceTertiary,
    ghost: colors.brand,
  }[variant];

  return (
    <Pressable
      testID={testID}
      disabled={isDisabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: isDisabled ? 0.55 : pressed ? 0.9 : 1 },
        variant === "ghost" && { borderWidth: 0 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    height: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
}));
