import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";

import { useTheme } from "@/src/theme";
import { Icon } from "./Icon";

// Shows the task logo, or a default offerwall icon when no URL is provided.
export function TaskLogo({ url, size = 48 }: { url?: string; size?: number }) {
  const { colors } = useTheme();
  const radius = Math.round(size * 0.29);
  if (url && url.trim()) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surfaceTertiary }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: colors.brandTertiary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="gift" size={Math.round(size * 0.5)} color={colors.brand} weight="fill" />
    </View>
  );
}
