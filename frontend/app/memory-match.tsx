import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Grid3x3, Trophy, Coins } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import NativeAd from "../src/components/NativeAd";
import RewardedAdModal from "../src/components/RewardedAdModal";
import { useGameSession } from "../src/hooks/useGameSession";
import { useGameAdConfig } from "../src/hooks/useGameAdConfig";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

const EMOJIS = ["🍎", "🚀", "🎲", "🎯", "🎵", "⭐", "💎", "🔥"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Card = { id: number; emoji: string; matched: boolean; flipped: boolean };

export default function MemoryMatch() {
  const maint = useMaintenance("/memory-match");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("memory");
  const [memReward, setMemReward] = useState<number>(200);
  useEffect(() => {
    api<{ memory_completion?: number }>("/app-config", { auth: false })
      .then((c) => setMemReward(Number(c?.memory_completion ?? 200) || 200))
      .catch(() => {});
  }, []);
  const session = useGameSession(adCfg.chances_per_ad, adCfg.every_n, "tm:game:memory");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number } | null>(null);
  const elapsedRef = useRef(0);

  const newGame = useCallback(() => {
    const deck = shuffle([...EMOJIS, ...EMOJIS]).map((emoji, id) => ({
      id, emoji, matched: false, flipped: false,
    }));
    setCards(deck);
    setSelected([]);
    setMoves(0);
    setStartedAt(Date.now());
    setElapsed(0);
    setGameOver(false);
  }, []);

  // First-mount ad gate removed — rewarded ad shows only when user taps Restart/Play.

  useEffect(() => {
    if (!startedAt || gameOver) return;
    const i = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      elapsedRef.current = s;
      setElapsed(s);
    }, 500);
    return () => clearInterval(i);
  }, [startedAt, gameOver]);

  const allMatched = useMemo(() => cards.length > 0 && cards.every((c) => c.matched), [cards]);

  const submitResult = useCallback(async () => {
    try {
      const r = await api<{ reward: number }>(
        "/games/memory/play",
        { method: "POST", body: { moves, time_seconds: elapsedRef.current, completed: true } },
      );
      session.consume();
      await refreshUser();
      setWinPopup({ visible: true, points: r.reward });
    } catch {
      setWinPopup({ visible: true, points: 0 });
    }
  }, [moves, refreshUser, session]);

  useEffect(() => {
    if (allMatched && !gameOver) {
      setGameOver(true);
      submitResult();
    }
  }, [allMatched, gameOver, submitResult]);

  const onFlip = (idx: number) => {
    if (gameOver) return;
    if (selected.length >= 2) return;
    if (cards[idx].flipped || cards[idx].matched) return;
    const next = cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
    const sel = [...selected, idx];
    setCards(next);
    setSelected(sel);
    if (sel.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = sel;
      if (next[a].emoji === next[b].emoji) {
        setTimeout(() => {
          setCards((cs) => cs.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)));
          setSelected([]);
        }, 350);
      } else {
        setTimeout(() => {
          setCards((cs) => cs.map((c, i) => (i === a || i === b ? { ...c, flipped: false } : c)));
          setSelected([]);
        }, 750);
      }
    }
  };

  const startNew = () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    newGame();
  };

  if (maint.enabled) return <MaintenanceCard title="Memory Match" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Memory Match</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.stats}>
        <View style={styles.statBox}><Text style={styles.statLabel}>Moves</Text><Text style={styles.statValue}>{moves}</Text></View>
        <View style={styles.statBox}><Text style={styles.statLabel}>Time</Text><Text style={styles.statValue}>{elapsed}s</Text></View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Chances</Text>
          <Text style={styles.statValue} testID="memory-chances">{session.chancesLeft}/{adCfg.chances_per_ad}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {cards.map((c, idx) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, (c.flipped || c.matched) && styles.cardFlipped, c.matched && styles.cardMatched]}
            onPress={() => onFlip(idx)}
            activeOpacity={0.8}
            testID={`memory-card-${idx}`}
          >
            <Text style={styles.cardEmoji}>{c.flipped || c.matched ? c.emoji : <Grid3x3 size={28} color="#fff" />}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.newBtn} onPress={startNew} testID="memory-new">
        <Text style={styles.newBtnTxt}>
          {(!session.hasUnlocked || session.chancesLeft <= 0)
            ? "Watch Ad to Get Chances"
            : (gameOver ? "Play Again" : "Restart")}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>Reward: {memReward} pts per completion</Text>

      <RewardedAdModal
        visible={showRewardedAd}
        duration={3}
        onReward={() => {
          setShowRewardedAd(false);
          session.grantChances();
          newGame();
        }}
        onClose={() => setShowRewardedAd(false)}
      />

      <Modal visible={!!winPopup?.visible} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View style={styles.popupIcon}><Trophy size={42} color={theme.colors.success} /></View>
            <Text style={styles.popupTitle}>Match complete! 🎉</Text>
            <View style={styles.popupRow}>
              <Coins size={20} color={theme.colors.primary} />
              <Text style={styles.popupPoints} testID="memory-win-points">
                {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No points"}
              </Text>
            </View>
            <Text style={styles.popupSub}>
              {moves} moves • {elapsedRef.current}s
            </Text>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => { setWinPopup(null); startNew(); }}
              testID="memory-popup-close"
            >
              <Text style={styles.popupBtnText}>Play Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.adWrap}>
        <NativeAd testID="memory-native-ad" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { paddingHorizontal: theme.spacing.lg },
  stats: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: theme.spacing.lg, marginBottom: 10 },
  statBox: { alignItems: "center" },
  statLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: "700", letterSpacing: 1 },
  statValue: { fontSize: 20, fontWeight: "800", color: theme.colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", padding: 8, gap: 8 },
  card: {
    width: 70, height: 78, borderRadius: 12,
    backgroundColor: "#6366F1",
    alignItems: "center", justifyContent: "center",
  },
  cardFlipped: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#6366F1" },
  cardMatched: { backgroundColor: "#D1FAE5", borderColor: "#10B981" },
  cardEmoji: { fontSize: 32 },
  newBtn: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.lg, marginTop: 12,
    paddingVertical: 14, borderRadius: theme.radii.pill, alignItems: "center",
  },
  newBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hint: { textAlign: "center", color: theme.colors.muted, fontSize: 12, marginTop: 8 },
  popupOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center", padding: theme.spacing.lg },
  popupCard: { backgroundColor: theme.colors.surface, width: "100%", maxWidth: 320, borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 6 },
  popupIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(16,185,129,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  popupPoints: { fontSize: 26, fontWeight: "900", color: theme.colors.primary },
  popupSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  popupBtn: { marginTop: 16, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
