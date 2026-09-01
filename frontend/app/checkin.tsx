import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Calendar, Flame, Gift } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import RewardedAdModal from "../src/components/RewardedAdModal";
import { useGameAdConfig } from "../src/hooks/useGameAdConfig";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

export default function CheckinScreen() {
  const maint = useMaintenance("/checkin");
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const adCfg = useGameAdConfig("checkin");
  const [chk, setChk] = useState({ base: 20, cap: 100 });
  useEffect(() => {
    api<{ checkin_base?: number; checkin_cap?: number }>("/app-config", { auth: false })
      .then((c) => setChk({ base: Number(c?.checkin_base ?? 20) || 20, cap: Number(c?.checkin_cap ?? 100) || 100 }))
      .catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const today = new Date().toISOString().slice(0, 10);
  const alreadyDone = user?.last_checkin === today;

  const onCheckin = async () => {
    if (busy || alreadyDone) return;
    setBusy(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    try {
      const res = await api<{ reward: number; streak: number }>("/tasks/checkin", { method: "POST" });
      setReward(res.reward);
      await refreshUser();
      // Item 6a — must watch an interstitial ad to claim the reward.
      setShowInterstitial(true);
    } catch (e: any) {
      toast.error("Cannot check in", { description: e?.message || "Try again later" });
    } finally {
      setBusy(false);
    }
  };

  if (maint.enabled) return <MaintenanceCard title="Daily Check-in" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Daily Check-in</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.streakCard}>
          <View style={styles.streakRow}>
            <Flame color={theme.colors.danger} size={28} />
            <Text style={styles.streakNum}>{user?.streak ?? 0}</Text>
          </View>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>

        <View style={styles.weekRow}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const active = (user?.streak ?? 0) >= d;
            return (
              <View key={d} style={[styles.dayDot, active && styles.dayDotActive]}>
                <Text style={[styles.dayText, active && { color: "#fff" }]}>{d}</Text>
              </View>
            );
          })}
        </View>

        {reward !== null && !showInterstitial ? (
          <View style={styles.rewardCard} testID="checkin-reward">
            <Gift size={48} color={theme.colors.success} />
            <Text style={styles.rewardTitle}>+{reward} points</Text>
            <Text style={styles.rewardSub}>Come back tomorrow for more</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale }], width: "100%" }}>
            <TouchableOpacity
              style={[styles.cta, alreadyDone && { backgroundColor: theme.colors.muted }]}
              onPress={onCheckin}
              disabled={busy || alreadyDone}
              testID="checkin-btn"
              activeOpacity={0.85}
            >
              <Calendar size={22} color="#fff" />
              <Text style={styles.ctaText}>
                {alreadyDone ? "Already checked in today" : busy ? "Loading..." : "Check in & earn"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Text style={styles.hint}>Reward grows with streak: {chk.base} → {chk.cap} points</Text>
      </View>

      <InterstitialAdModal
        visible={showInterstitial && adCfg.ad_type !== "rewarded"}
        duration={3}
        onDone={() => setShowInterstitial(false)}
      />
      <RewardedAdModal
        visible={showInterstitial && adCfg.ad_type === "rewarded"}
        duration={3}
        onReward={() => setShowInterstitial(false)}
        onClose={() => setShowInterstitial(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  body: { flex: 1, padding: theme.spacing.lg, alignItems: "center", gap: 24 },
  streakCard: {
    width: 200, height: 200, borderRadius: 100,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 8, borderColor: theme.colors.primarySoft,
    ...theme.shadow.soft,
  },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  streakNum: { fontSize: 56, fontWeight: "800", color: theme.colors.text },
  streakLabel: { fontSize: 14, color: theme.colors.muted, fontWeight: "600", marginTop: 4 },
  weekRow: { flexDirection: "row", gap: 8 },
  dayDot: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  dayDotActive: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  dayText: { color: theme.colors.muted, fontWeight: "700" },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: theme.colors.primary,
    height: 60, borderRadius: theme.radii.lg, ...theme.shadow.soft,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { color: theme.colors.muted, fontSize: 12 },
  rewardCard: {
    width: "100%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rewardTitle: { fontSize: 30, fontWeight: "800", color: theme.colors.success },
  rewardSub: { fontSize: 13, color: theme.colors.muted },
  doneBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 8 },
  doneText: { color: "#fff", fontWeight: "800" },
});
