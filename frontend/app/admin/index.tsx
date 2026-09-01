import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft, Image as ImageIcon, Megaphone, Wallet, LinkIcon, ChevronRight, Shield,
  Users as UsersIcon, ListChecks, IndianRupee, Globe, Gift, Smartphone, RefreshCw,
  Megaphone as AdsIcon, Sliders, LayoutGrid, Gamepad2, Wrench,
} from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";

type Stats = {
  users: number; pending_withdrawals: number; successful_withdrawals: number;
  active_today: number; pending_campaigns: number;
};

export default function AdminHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = React.useCallback(() => {
    setRefreshing(true);
    api<Stats>("/admin/stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.is_admin) {
      router.replace("/(tabs)/home");
      return;
    }
    loadStats();
  }, [user, router, loadStats]);

  if (!user?.is_admin) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Panel</Text>
        <TouchableOpacity onPress={loadStats} testID="admin-refresh" style={styles.refreshIcon}>
          <RefreshCw size={20} color={refreshing ? theme.colors.muted : theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.welcome}>Welcome, {user.name}</Text>

        <View style={styles.statsRow}>
          <Stat label="Users" value={stats?.users ?? "—"}
            onPress={() => router.push("/admin/users")} testID="stat-users" />
          <Stat label="Active today" value={stats?.active_today ?? "—"} color={theme.colors.success}
            onPress={() => router.push({ pathname: "/admin/users", params: { active: "1" } } as any)} testID="stat-active" />
          <Stat label="Pending WD" value={stats?.pending_withdrawals ?? "—"} color={theme.colors.secondary}
            onPress={() => router.push("/admin/withdrawals")} testID="stat-pending-wd" />
        </View>
        <View style={styles.statsRow}>
          <Stat label="Paid WD" value={stats?.successful_withdrawals ?? "—"} color={theme.colors.success}
            onPress={() => router.push("/admin/withdrawals")} testID="stat-paid-wd" />
          <Stat label="Pending Tasks" value={stats?.pending_campaigns ?? "—"} color={theme.colors.secondary}
            onPress={() => router.push("/admin/campaign-completions")} testID="stat-pending-tasks" />
          <Stat label="" value="" />
        </View>

        <Text style={styles.section}>MANAGE</Text>
        <Tile icon={<UsersIcon size={20} color={theme.colors.primary} />} label="Users"
          sub="Search, view & adjust points" onPress={() => router.push("/admin/users")}
          testID="admin-users" />
        <Tile icon={<ListChecks size={20} color={theme.colors.primary} />} label="Campaign Tasks"
          sub="Approve / reject pending tasks" onPress={() => router.push("/admin/campaign-completions")}
          testID="admin-completions" />
        <Tile icon={<Wallet size={20} color={theme.colors.primary} />} label="Withdrawals"
          sub="Approve / reject requests" onPress={() => router.push("/admin/withdrawals")}
          testID="admin-withdrawals" />
        <Tile icon={<IndianRupee size={20} color={theme.colors.primary} />} label="Withdraw Amounts"
          sub="Edit amount selection chips" onPress={() => router.push("/admin/withdraw-settings")}
          testID="admin-withdraw-settings" />
        <Tile icon={<Gift size={20} color={theme.colors.primary} />} label="Referral Rewards"
          sub="Tiers, sharing text & milestone bonuses" onPress={() => router.push("/admin/referral-settings")}
          testID="admin-referral-settings" />
        <Tile icon={<Smartphone size={20} color={theme.colors.primary} />} label="App Version"
          sub="Force update + Play Store URL" onPress={() => router.push("/admin/version")}
          testID="admin-version" />
        <Tile icon={<AdsIcon size={20} color={theme.colors.primary} />} label="AdMob Settings"
          sub="Banner, Interstitial, Rewarded & Native unit IDs" onPress={() => router.push("/admin/admob")}
          testID="admin-admob" />
        <Tile icon={<Sliders size={20} color={theme.colors.primary} />} label="App Config"
          sub="Exchange ratio, min withdrawals, task rewards, check-in, referral mode"
          onPress={() => router.push("/admin/settings")} testID="admin-settings" />
        <Tile icon={<Gamepad2 size={20} color={theme.colors.primary} />} label="Game Rewards"
          sub="Higher-Lower streak tiers, Memory, TTT, Math, Tap Rush, Trivia"
          onPress={() => router.push("/admin/game-rewards")} testID="admin-game-rewards" />
        <Tile icon={<Megaphone size={20} color={theme.colors.primary} />} label="Game Ads"
          sub="Set ad type & how often ads show per game"
          onPress={() => router.push("/admin/game-ads")} testID="admin-game-ads" />
        <Tile icon={<Wrench size={20} color={theme.colors.primary} />} label="Maintenance"
          sub="Toggle Coming Soon per tab / task / game / wallet screen"
          onPress={() => router.push("/admin/maintenance")} testID="admin-maintenance" />
        <Tile icon={<ImageIcon size={20} color={theme.colors.primary} />} label="Banners"
          sub="Sliding banners on home" onPress={() => router.push("/admin/banners")}
          testID="admin-banners" />
        <Tile icon={<Megaphone size={20} color={theme.colors.primary} />} label="Offerwall"
          sub="High paying offers (logo, link, category, difficulty)" onPress={() => router.push("/admin/campaigns")}
          testID="admin-campaigns" />
        <Tile icon={<Globe size={20} color={theme.colors.primary} />} label="Visit Sites"
          sub="Add websites for Visit & Earn" onPress={() => router.push("/admin/visit-sites")}
          testID="admin-visit-sites" />
        <Tile icon={<LinkIcon size={20} color={theme.colors.primary} />} label="Channel Links"
          sub="Telegram, Contact, Support, Privacy, Terms" onPress={() => router.push("/admin/links")}
          testID="admin-links" />
        <Tile icon={<LayoutGrid size={20} color={theme.colors.primary} />} label="Profile Buttons"
          sub="Customise Quick Access buttons on the Profile tab"
          onPress={() => router.push("/admin/profile-buttons")} testID="admin-profile-buttons" />
        <Tile icon={<Gamepad2 size={20} color={theme.colors.primary} />} label="Earn Cards"
          sub="Reorder, hide, or relabel the cards shown on Earn tab"
          onPress={() => router.push("/admin/earn-cards")} testID="admin-earn-cards" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color, onPress, testID }: { label: string; value: any; color?: string; onPress?: () => void; testID?: string }) {
  if (!label) {
    return <View style={[styles.stat, { opacity: 0 }]} />;
  }
  const inner = (
    <>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={styles.stat} onPress={onPress} testID={testID} activeOpacity={0.75}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.stat}>{inner}</View>;
}

function Tile({ icon, label, sub, onPress, testID }: any) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tile} testID={testID} activeOpacity={0.85}>
      <View style={styles.tileIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text style={styles.tileSub}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  refreshIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  body: { padding: theme.spacing.lg },
  welcome: { color: theme.colors.muted, fontSize: 14, marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  stat: {
    flex: 1, backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg, padding: theme.spacing.md, alignItems: "center",
    borderWidth: 1, borderColor: theme.colors.border,
  },
  statValue: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  statLabel: { fontSize: 10, color: theme.colors.muted, marginTop: 2, fontWeight: "700", letterSpacing: 1 },
  section: {
    fontSize: 11, fontWeight: "800", color: theme.colors.muted,
    letterSpacing: 1.4, marginTop: theme.spacing.md, marginBottom: 12,
  },
  tile: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: 12,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  tileSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
});
