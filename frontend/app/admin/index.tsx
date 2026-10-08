import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/components/ui/Icon";
import { Segmented } from "@/src/components/ui/Segmented";
import { BannersManager } from "@/src/components/admin/BannersManager";
import { OfferwallsManager } from "@/src/components/admin/OfferwallsManager";
import { ForceUpdateManager } from "@/src/components/admin/ForceUpdateManager";
import {
  adminPayouts,
  adminSubmissions,
  countActiveToday,
  countUsers,
} from "@/src/lib/firestore";

export default function Admin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [manageTab, setManageTab] = useState("banners");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    // allow the spinner to be visible briefly
    setTimeout(() => setRefreshing(false), 600);
  };

  const usersQ = useQuery({ queryKey: ["count-users"], queryFn: countUsers });
  const activeQ = useQuery({ queryKey: ["count-active"], queryFn: countActiveToday });
  const payoutQ = useQuery({
    queryKey: ["count-payout-pending"],
    queryFn: async () => (await adminPayouts("pending")).length,
  });
  const offerQ = useQuery({
    queryKey: ["count-offer-pending"],
    queryFn: async () => (await adminSubmissions("pending")).length,
  });

  const stats: {
    key: string;
    label: string;
    icon: IconName;
    value: number | undefined;
    color: string;
    onPress?: () => void;
  }[] = [
    { key: "users", label: "Users", icon: "user", value: usersQ.data, color: colors.brand },
    { key: "active", label: "Active Today", icon: "sparkle", value: activeQ.data, color: colors.success },
    {
      key: "payout",
      label: "Payouts",
      icon: "wallet",
      value: payoutQ.data,
      color: colors.warning,
      onPress: () => router.push("/admin/payouts"),
    },
    {
      key: "offerwall",
      label: "Offerwall",
      icon: "clipboard",
      value: offerQ.data,
      color: colors.info,
      onPress: () => router.push("/admin/offerwall-requests"),
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={onRefresh}
          hitSlop={10}
          style={styles.headerBtn}
          testID="admin-refresh"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <Icon name="refresh" size={22} color={colors.brand} weight="bold" />
          )}
        </Pressable>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn} testID="admin-back">
          <Icon name="x" size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statsRow, { marginTop: 8 }]}>
          {stats.map((s) => {
            const Wrapper: any = s.onPress ? Pressable : View;
            return (
              <Wrapper
                key={s.key}
                testID={`stat-${s.key}`}
                onPress={s.onPress}
                style={styles.statCard}
              >
                <View style={[styles.statIcon, { backgroundColor: s.color + "1A" }]}>
                  <Icon name={s.icon} size={18} color={s.color} weight="fill" />
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {s.value ?? "—"}
                </Text>
                <Text style={styles.statLabel} numberOfLines={1}>
                  {s.label}
                </Text>
              </Wrapper>
            );
          })}
        </View>

        <View style={{ marginTop: 24 }} />
        <Segmented
          testID="manage-tabs"
          value={manageTab}
          onChange={setManageTab}
          options={[
            { key: "banners", label: "Banners" },
            { key: "offerwalls", label: "Offerwalls" },
            { key: "force", label: "Update" },
          ]}
        />
        <View style={{ marginTop: 18 }}>
          {manageTab === "banners" && <BannersManager />}
          {manageTab === "offerwalls" && <OfferwallsManager />}
          {manageTab === "force" && <ForceUpdateManager />}
        </View>
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
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: c.onSurface },
  section: { fontSize: 18, fontWeight: "800", color: c.onSurface, marginTop: 20, marginBottom: 14 },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 6,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 20, fontWeight: "800", color: c.onSurfaceSecondary },
  statLabel: { fontSize: 11, color: c.muted, fontWeight: "700", textAlign: "center" },
}));
