import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Gift, Sparkles } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import RewardedAdModal from "../src/components/RewardedAdModal";
import { useGameAdConfig } from "../src/hooks/useGameAdConfig";
import NativeAd from "../src/components/NativeAd";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

const BOX_COLORS = ["#F59E0B", "#EC4899", "#10B981", "#06B6D4"];

export default function DailyChallenge() {
  const maint = useMaintenance("/daily-challenge");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("daily_challenge");
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [picking, setPicking] = useState(false);
  const [revealedBox, setRevealedBox] = useState<number | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [jackpot, setJackpot] = useState(false);
  const [showRewarded, setShowRewarded] = useState(false);
  const [pendingJackpot, setPendingJackpot] = useState<number | null>(null);

  const loadState = useCallback(() => {
    api<{ claimed_today: boolean }>("/games/daily-challenge/state")
      .then((s) => setClaimed(s.claimed_today))
      .catch(() => {});
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  const onPickBox = async (idx: number) => {
    if (claimed || picking) return;
    setPicking(true);
    setRevealedBox(idx);
    try {
      const r = await api<{ reward: number; jackpot: boolean }>(
        "/games/daily-challenge/open",
        { method: "POST", body: {} },
      );
      setReward(r.reward);
      setJackpot(r.jackpot);
      setClaimed(true);
      await refreshUser();
      // Defer jackpot popup until after the rewarded ad closes.
      if (r.jackpot) setPendingJackpot(r.reward);
      setShowRewarded(true);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Could not open box" });
      setRevealedBox(null);
    } finally {
      setPicking(false);
    }
  };

  const onAdDone = () => {
    setShowRewarded(false);
    if (pendingJackpot !== null) {
      const amt = pendingJackpot;
      setPendingJackpot(null);
      toast.info("🎰 JACKPOT! 🎰", { description: `You won ${amt} pts! Massive luck today.` });
    }
  };

  if (maint.enabled) return <MaintenanceCard title="Daily Challenge" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Daily Challenge</Text>
        <Sparkles size={22} color={theme.colors.primary} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Gift size={64} color="#fff" />
          <Text style={styles.heroTitle}>Mystery Box</Text>
          <Text style={styles.heroSub}>Pick one box. Open once per day.</Text>
          <Text style={styles.heroSub}>Jackpot Player: 1 in 100 = 50000 pts</Text>
        </View>

        {claimed === null ? (
          <Text style={styles.loading}>Loading…</Text>
        ) : claimed && revealedBox === null ? (
          <View style={styles.claimedBox}>
            <Text style={styles.claimedTxt}>✅ Already opened today.</Text>
            <Text style={styles.claimedSub}>Come back tomorrow for another box.</Text>
          </View>
        ) : (
          <View style={styles.boxGrid}>
            {[0, 1, 2, 3].map((i) => {
              const revealed = revealedBox === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.box, { backgroundColor: BOX_COLORS[i] }, revealed && styles.boxOpen]}
                  onPress={() => onPickBox(i)}
                  activeOpacity={0.85}
                  disabled={picking || claimed === true}
                  testID={`dc-box-${i}`}
                >
                  {revealed && reward !== null ? (
                    <>
                      <Text style={styles.boxReward}>+{reward}</Text>
                      <Text style={styles.boxRewardSub}>pts</Text>
                      {jackpot && <Text style={styles.jackpotTxt}>🎰 JACKPOT</Text>}
                    </>
                  ) : (
                    <Gift size={48} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <NativeAd testID="dc-native-ad" />
      </ScrollView>

      <InterstitialAdModal
        visible={showRewarded && adCfg.ad_type === "interstitial"}
        duration={3}
        onDone={onAdDone}
      />
      <RewardedAdModal
        visible={showRewarded && adCfg.ad_type !== "interstitial"}
        duration={3}
        onReward={onAdDone}
        onClose={onAdDone}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  hero: {
    backgroundColor: theme.colors.primary,
    margin: theme.spacing.lg,
    padding: 24, borderRadius: theme.radii.xl, alignItems: "center",
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 8 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 6, textAlign: "center" },
  loading: { textAlign: "center", color: theme.colors.muted, marginTop: 20 },
  claimedBox: { alignItems: "center", padding: theme.spacing.lg, marginTop: 12 },
  claimedTxt: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  claimedSub: { color: theme.colors.muted, fontSize: 13, marginTop: 6 },
  boxGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", paddingHorizontal: theme.spacing.lg },
  box: {
    width: "45%", aspectRatio: 1, borderRadius: theme.radii.xl,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  boxOpen: { borderWidth: 4, borderColor: "#fff" },
  boxReward: { color: "#fff", fontSize: 36, fontWeight: "900" },
  boxRewardSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "700" },
  jackpotTxt: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 6, letterSpacing: 1 },
});
