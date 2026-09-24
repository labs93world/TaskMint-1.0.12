import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ArrowUp, ArrowDown, Trophy, RotateCcw, Coins } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import NativeAd from "../src/components/NativeAd";
import RewardedAdModal from "../src/components/RewardedAdModal";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import { useGameSession } from "../src/hooks/useGameSession";
import { useGameAdConfig } from "../src/hooks/useGameAdConfig";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type Active = { date: string; current_card: number; streak: number };
type State = { active: Active | null };

type StartRes = { card: number; streak: number };

type GuessRes = {
  card: number; prev_card: number;
  correct: boolean; streak: number;
  potential_reward?: number; reward?: number;
  round_over: boolean;
};

const CARD_LABEL = (n: number) => (n === 1 ? "A" : n === 11 ? "J" : n === 12 ? "Q" : n === 13 ? "K" : String(n));

function streakReward(s: number, cfg: { r3: number; r5: number; r7: number }) {
  if (s >= 7) return cfg.r7;
  if (s >= 5) return cfg.r5;
  if (s >= 3) return cfg.r3;
  return 0;
}

export default function HigherLower() {
  const maint = useMaintenance("/higher-lower");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("higher_lower");
  const session = useGameSession(adCfg.chances_per_ad, adCfg.every_n, "tm:game:hl");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [card, setCard] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [potential, setPotential] = useState(0);
  const [busy, setBusy] = useState(false);
  // Reward tiers fetched from /api/app-config so the local estimate &
  // displayed hint always match what the backend will actually pay.
  const [rewardCfg, setRewardCfg] = useState({ r3: 30, r5: 75, r7: 100 });
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number; streak: number } | null>(null);

  useEffect(() => {
    api<{
      hl_reward_streak_3?: number;
      hl_reward_streak_5?: number;
      hl_reward_streak_7?: number;
    }>("/app-config", { auth: false })
      .then((c) =>
        setRewardCfg({
          r3: Number(c?.hl_reward_streak_3 ?? 30) || 30,
          r5: Number(c?.hl_reward_streak_5 ?? 75) || 75,
          r7: Number(c?.hl_reward_streak_7 ?? 100) || 100,
        }),
      )
      .catch(() => {});
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const s = await api<State>("/games/hl/state");
      setState(s);
      if (s.active) {
        setCard(s.active.current_card);
        setStreak(s.active.streak);
        setPotential(streakReward(s.active.streak, rewardCfg));
      } else {
        setCard(null);
        setStreak(0);
        setPotential(0);
      }
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Failed to load" });
    }
  }, [rewardCfg]);

  useEffect(() => { fetchState(); }, [fetchState]);

  // First-mount ad gate removed — rewarded ad shows only when user taps Start.

  const start = async () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    setBusy(true);
    try {
      const r = await api<StartRes>("/games/hl/start", {
        method: "POST",
        body: { ad_refill: false },
      });
      setCard(r.card);
      setStreak(0);
      setPotential(0);
      setState((s) => s && {
        ...s,
        active: { date: "", current_card: r.card, streak: 0 },
      });
    } catch (e: any) {
      toast.info("Couldn't start", { description: e?.message || "Try later" });
    } finally {
      setBusy(false);
    }
  };

  const finishRound = (reward: number, finalStreak: number) => {
    session.consume();
    setWinPopup({ visible: true, points: reward, streak: finalStreak });
    setState((s) => s && { ...s, active: null });
    refreshUser().catch(() => {});
  };

  const guess = async (g: "higher" | "lower") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<GuessRes>("/games/hl/guess", {
        method: "POST",
        body: { guess: g },
      });
      setCard(r.card);
      setStreak(r.streak);
      setPotential(r.potential_reward ?? streakReward(r.streak, rewardCfg));
      if (r.round_over) finishRound(r.reward ?? 0, r.streak);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const cashout = async () => {
    if (busy || streak < 3) return;
    setBusy(true);
    try {
      const r = await api<{ reward: number; streak: number }>("/games/hl/cashout", { method: "POST" });
      setCard(null);
      setStreak(0);
      setPotential(0);
      finishRound(r.reward, r.streak);
    } catch (e: any) {
      toast.info("Couldn't cash out", { description: e?.message || "Try later" });
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header onBack={() => router.back()} title="Higher or Lower" />
        <View style={styles.loadingWrap}><Text style={styles.muted}>Loading…</Text></View>
      </SafeAreaView>
    );
  }

  const inRound = card !== null && state.active !== null;

  if (maint.enabled) return <MaintenanceCard title="Higher or Lower" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header onBack={() => router.back()} title="Higher or Lower" />

      <View style={styles.body}>
        <View style={styles.counter}>
          <Text style={styles.counterTxt} testID="hl-chances">
            🎟️ Chances {session.chancesLeft}/10
          </Text>
          {inRound && <Text style={styles.streakTxt}>🔥 Streak {streak} → +{potential} pts</Text>}
        </View>

        <View style={styles.cardWrap}>
          {card !== null ? (
            <View style={styles.card} testID="hl-card">
              <Text style={styles.cardLabel}>{CARD_LABEL(card)}</Text>
              <Text style={styles.cardSub}>1-13 scale</Text>
            </View>
          ) : (
            <View style={[styles.card, styles.cardEmpty]}>
              <Text style={styles.cardEmptyTxt}>?</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {inRound ? (
          <>
            <View style={styles.guessRow}>
              <TouchableOpacity
                style={[styles.guessBtn, { backgroundColor: theme.colors.success }]}
                onPress={() => guess("higher")}
                disabled={busy}
                testID="hl-higher-btn"
              >
                <ArrowUp size={28} color="#fff" />
                <Text style={styles.guessTxt}>Higher</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.guessBtn, { backgroundColor: theme.colors.danger }]}
                onPress={() => guess("lower")}
                disabled={busy}
                testID="hl-lower-btn"
              >
                <ArrowDown size={28} color="#fff" />
                <Text style={styles.guessTxt}>Lower</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.cashoutBtn, streak < 3 && styles.cashoutBtnOff]}
              onPress={cashout}
              disabled={streak < 3 || busy}
              testID="hl-cashout-btn"
            >
              <Text style={styles.cashoutTxt}>
                {streak >= 3 ? `Cash out +${potential} pts` : "Cash out (need streak 3+)"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={start}
            disabled={busy}
            testID="hl-start-btn"
          >
            <Text style={styles.startTxt}>
              {(!session.hasUnlocked || session.chancesLeft <= 0) ? "Watch Ad to Get Chances" : "Start Round"}
            </Text>
          </TouchableOpacity>
        )}

      </View>

      <RewardedAdModal
        visible={showRewardedAd}
        duration={3}
        onReward={() => { setShowRewardedAd(false); session.grantChances(); }}
        onClose={() => setShowRewardedAd(false)}
      />

      <InterstitialAdModal
        visible={session.shouldShowInterstitial}
        duration={3}
        onDone={session.acknowledgeInterstitial}
      />

      <Modal visible={!!winPopup?.visible} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View style={[styles.popupIcon, winPopup && winPopup.points > 0 ? styles.popupIconWin : styles.popupIconLose]}>
              {winPopup && winPopup.points > 0
                ? <Trophy size={42} color={theme.colors.success} />
                : <RotateCcw size={36} color={theme.colors.muted} />}
            </View>
            <Text style={styles.popupTitle}>
              {winPopup && winPopup.points > 0 ? "You won! 🎉" : "Round ended"}
            </Text>
            <Text style={styles.popupSub}>Streak {winPopup?.streak ?? 0}</Text>
            <View style={styles.popupRow}>
              <Coins size={20} color={theme.colors.primary} />
              <Text style={styles.popupPoints} testID="hl-win-points">
                {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No reward"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => setWinPopup(null)}
              testID="hl-popup-close"
            >
              <Text style={styles.popupBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.adWrap}>
        <NativeAd testID="hl-native-ad" />
      </View>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} testID="back-btn">
        <ChevronLeft size={26} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <View style={{ width: 26 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { flex: 1, alignSelf: "stretch" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: theme.colors.muted },
  body: { flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: 12 },
  counter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: theme.colors.primarySoft,
    padding: 12, borderRadius: theme.radii.md,
  },
  counterTxt: { color: theme.colors.primary, fontWeight: "800", fontSize: 13 },
  streakTxt: { color: theme.colors.text, fontWeight: "800", fontSize: 13 },
  cardWrap: { alignItems: "center", marginTop: 10 },
  card: {
    width: 170, height: 220, borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 10,
  },
  cardEmpty: { borderStyle: "dashed", borderColor: theme.colors.muted },
  cardLabel: { fontSize: 86, fontWeight: "900", color: theme.colors.primary },
  cardSub: { fontSize: 12, color: theme.colors.muted, marginTop: 8 },
  cardEmptyTxt: { fontSize: 80, fontWeight: "900", color: theme.colors.muted },
  guessRow: { flexDirection: "row", gap: 12 },
  guessBtn: {
    flex: 1, paddingVertical: 18, borderRadius: theme.radii.lg,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
  },
  guessTxt: { color: "#fff", fontWeight: "800", fontSize: 17 },
  cashoutBtn: {
    backgroundColor: "#F59E0B", paddingVertical: 14, borderRadius: theme.radii.pill,
    alignItems: "center", marginTop: 4,
  },
  cashoutBtnOff: { backgroundColor: theme.colors.border },
  cashoutTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  startBtn: {
    backgroundColor: theme.colors.primary, paddingVertical: 16,
    borderRadius: theme.radii.pill, alignItems: "center",
  },
  startTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  hint: { color: theme.colors.muted, textAlign: "center", fontSize: 11, marginTop: 4, marginBottom: 8 },
  popupOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center", padding: theme.spacing.lg },
  popupCard: { backgroundColor: theme.colors.surface, width: "100%", maxWidth: 320, borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 6 },
  popupIcon: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  popupIconWin: { backgroundColor: "rgba(16,185,129,0.12)" },
  popupIconLose: { backgroundColor: "rgba(148,163,184,0.18)" },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupSub: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  popupPoints: { fontSize: 26, fontWeight: "900", color: theme.colors.primary },
  popupBtn: { marginTop: 16, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
