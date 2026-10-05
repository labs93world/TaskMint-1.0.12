import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/ui/Icon";
import { AdBanner } from "@/src/ads";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "house" },
  { name: "wallet", label: "Wallet", icon: "wallet" },
  { name: "profile", label: "Profile", icon: "user" },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      {/* Single shared banner ad above the tab buttons (native build only) */}
      <View style={styles.bannerSlot} testID="tab-banner-ad">
        <AdBanner />
      </View>
      <View style={styles.bar}>
        {state.routes
          .filter((r) => TABS.some((t) => t.name === r.name))
          .map((route) => {
            const tab = TABS.find((t) => t.name === route.name)!;
            const routeIndex = state.routes.findIndex((r) => r.key === route.key);
            const focused = state.index === routeIndex;
            const color = focused ? colors.brandPrimary : colors.muted;
            return (
              <Pressable
                key={route.key}
                testID={`tab-${tab.label.toLowerCase()}`}
                style={styles.item}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              >
                <Icon
                  name={tab.icon}
                  size={26}
                  color={color}
                  weight={focused ? "fill" : "regular"}
                />
                <Text style={[styles.label, { color }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="wallet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  bannerSlot: { alignItems: "center", justifyContent: "center" },
  bar: {
    flexDirection: "row",
    height: 64,
    alignItems: "center",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontSize: 12, fontWeight: "700" },
}));
