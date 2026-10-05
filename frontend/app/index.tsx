import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useUser } from "@/src/context/UserContext";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { ready, onboarded } = useUser();
  const { colors } = useTheme();

  useEffect(() => {}, [ready]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
        }}
      >
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return <Redirect href={onboarded ? "/(tabs)" : "/login"} />;
}
