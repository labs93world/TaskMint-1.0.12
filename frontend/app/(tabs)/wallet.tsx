import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { ArrowDownToLine, ArrowUpToLine, Receipt } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { theme } from "../../src/lib/theme";
import { api } from "../../src/lib/api";
import BalanceCard from "../../src/components/BalanceCard";
import MaintenanceCard from "../../src/components/MaintenanceCard";
import { useMaintenance } from "../../src/hooks/useMaintenance";

type Txn = {
  id: string; type: "earn" | "withdraw"; source: string;
  category?: string;
  points: number; note: string; created_at: string;
};

const sourceLabel: Record<string, string> = {
  checkin: "Daily Check-in", spin: "Spin Wheel", scratch: "Scratch Card",
  campaign: "Campaign", quiz: "Quiz", survey: "Survey", watch: "Watch & Earn",
  withdraw: "Withdrawal", admin: "Admin Adjustment",
  coinmine: "Coin Mine", plinko: "Plinko",
  treasure: "Treasure Hunt", higher_lower: "Higher or Lower",
  tictactoe: "Tic-Tac-Toe", memory: "Memory Match", math: "Math Sprint",
  visit: "Visit & Earn", referral: "Referral Bonus",
};

export default function WalletScreen() {
  const maint = useMaintenance("/wallet");
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await api<Txn[]>("/wallet/transactions");
      setTxns(t);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    refreshUser();
    load();
  }, [load, refreshUser]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), load()]);
    setRefreshing(false);
  };

  if (maint.enabled) return <MaintenanceCard title="Wallet" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Wallet</Text>

        <View style={styles.section}>
          <BalanceCard
            points={user?.points ?? 0}
            onAction={() => router.push("/withdraw")}
            actionLabel="withdraw"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : txns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Receipt size={36} color={theme.colors.muted} />
              <Text style={styles.empty}>No transactions yet.</Text>
              <Text style={styles.emptySub}>Start earning to see your history here.</Text>
            </View>
          ) : (
            txns.map((t) => (
              <View key={t.id} style={styles.txn} testID={`txn-${t.id}`}>
                <View
                  style={[
                    styles.txnIcon,
                    { backgroundColor: t.points > 0 ? "rgba(16,185,129,0.12)" : "rgba(255,107,107,0.12)" },
                  ]}
                >
                  {t.points > 0 ? (
                    <ArrowDownToLine size={18} color={theme.colors.success} />
                  ) : (
                    <ArrowUpToLine size={18} color={theme.colors.danger} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnTitle} numberOfLines={1}>
                    {sourceLabel[t.source] || t.source}
                  </Text>
                  <Text style={styles.txnNote} numberOfLines={1}>
                    {t.note || new Date(t.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txnAmt,
                    { color: t.points > 0 ? theme.colors.success : theme.colors.danger },
                  ]}
                >
                  {t.points > 0 ? "+" : ""}{t.points} pts
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { paddingBottom: 16 },
  title: {
    fontSize: 28, fontWeight: "800", color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xs,
  },
  section: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm },
  sectionTitle: {
    fontSize: 18, fontWeight: "800", color: theme.colors.text, marginBottom: theme.spacing.sm,
  },
  txn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: 6,
  },
  txnIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  txnNote: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  txnAmt: { fontSize: 14, fontWeight: "800" },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: 8,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  empty: { color: theme.colors.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
  emptySub: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
});
