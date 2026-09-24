import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Coins, Trophy } from "lucide-react-native";
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

const ROUND_SECONDS = 30;
const SPAWN_MS = 320;          // more frequent drops
const FALL_DURATION_MS = 2400; // ms for an item to cross the play area
const TICK_MS = 50;            // animation tick

type ItemKind = "diamond" | "gold" | "silver" | "bomb";
type FallingItem = { id: number; kind: ItemKind; emoji: string; x: number; bornAt: number; tapped: boolean };

type Phase = "idle" | "playing" | "done";

// Probability weights — diamonds/gold are rare; silver is the bread-and-butter; bombs sprinkle in.
const KIND_WEIGHTS: { kind: ItemKind; weight: number }[] = [
  { kind: "diamond", weight: 5 },
  { kind: "gold",    weight: 10 },
  { kind: "silver",  weight: 65 },
  { kind: "bomb",    weight: 20 },
];

const EMOJI_BY_KIND: Record<ItemKind, string[]> = {
  diamond: ["💎", "🎁"],
  gold:    ["🪙"],
  silver:  ["🟤", "🔵", "🟣", "🟢", "🟠", "🟡"],
  bomb:    ["💣", "⚫", "🌚", "☣️"],
};

function pickKind(): ItemKind {
  const total = KIND_WEIGHTS.reduce((s, k) => s + k.weight, 0);
  let r = Math.random() * total;
  for (const k of KIND_WEIGHTS) { r -= k.weight; if (r <= 0) return k.kind; }
  return "silver";
}

function pickEmoji(kind: ItemKind): string {
  const list = EMOJI_BY_KIND[kind];
  return list[Math.floor(Math.random() * list.length)];
}

export default function TapRush() {
  const maint = useMaintenance("/tap-rush");
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("tap");
  const [tapCfg, setTapCfg] = useState({ diamond: 3, gold: 2, silver: 1, bomb: 5 });
  useEffect(() => {
    api<{ tap_per_diamond?: number; tap_per_gold?: number; tap_per_silver?: number; tap_bomb_penalty?: number }>("/app-config", { auth: false })
      .then((c) => setTapCfg({
        diamond: Number(c?.tap_per_diamond ?? 3) || 3,
        gold: Number(c?.tap_per_gold ?? 2) || 2,
        silver: Number(c?.tap_per_silver ?? 1) || 1,
        bomb: Number(c?.tap_bomb_penalty ?? 5) || 5,
      }))
      .catch(() => {});
  }, []);
  const session = useGameSession(adCfg.chances_per_ad, adCfg.every_n, "tm:game:tap");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [diamond, setDiamond] = useState(0);
  const [gold, setGold] = useState(0);
  const [silver, setSilver] = useState(0);
  const [bombs, setBombs] = useState(0);
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number; diamond: number; gold: number; silver: number; bombs: number } | null>(null);
  const idRef = useRef(1);
  const diamondRef = useRef(0);
  const goldRef = useRef(0);
  const silverRef = useRef(0);
  const bombsRef = useRef(0);
  const submittedRef = useRef(false);
  // Deadline-based timer: we compare wall-clock against a stored deadline so a
  // re-render caused by tapping coins never restarts/cancels the countdown.
  const deadlineRef = useRef<number>(0);
  const submitRef = useRef<() => void>(() => {});
  const playAreaH = 460;
  const itemSize = 42; // smaller items so more can fit
  const margin = 12;
  const playW = Math.max(0, width - margin * 2);
  const maxX = Math.max(0, playW - itemSize);

  const reset = () => {
    setItems([]);
    setDiamond(0); setGold(0); setSilver(0); setBombs(0);
    diamondRef.current = 0; goldRef.current = 0; silverRef.current = 0; bombsRef.current = 0;
    submittedRef.current = false;
    setTimeLeft(ROUND_SECONDS);
  };

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r = await api<{ reward: number }>("/games/tap/play", {
        method: "POST",
        body: {
          diamond: diamondRef.current,
          gold: goldRef.current,
          silver: silverRef.current,
          bombs_hit: bombsRef.current,
          duration_seconds: ROUND_SECONDS,
        },
      });
      session.consume();
      await refreshUser();
      setWinPopup({
        visible: true, points: r.reward,
        diamond: diamondRef.current, gold: goldRef.current,
        silver: silverRef.current, bombs: bombsRef.current,
      });
    } catch {
      setWinPopup({
        visible: true, points: 0,
        diamond: diamondRef.current, gold: goldRef.current,
        silver: silverRef.current, bombs: bombsRef.current,
      });
    }
  }, [refreshUser, session]);

  // Keep a stable ref to the latest submit so the timer effect never re-runs
  // when callbacks change identity (taps don't restart the countdown).
  useEffect(() => { submitRef.current = submit; }, [submit]);

  // Timer — runs once per round (deps only [phase]) and compares wall-clock
  // against `deadlineRef`. Coin taps no longer cancel/restart it.
  useEffect(() => {
    if (phase !== "playing") return;
    deadlineRef.current = Date.now() + ROUND_SECONDS * 1000;
    setTimeLeft(ROUND_SECONDS);
    const i = setInterval(() => {
      const remainingMs = deadlineRef.current - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remaining);
      if (remainingMs <= 0) {
        clearInterval(i);
        setPhase("done");
        submitRef.current();
      }
    }, 200);
    return () => clearInterval(i);
  }, [phase]);

  // Spawner
  useEffect(() => {
    if (phase !== "playing") return;
    const i = setInterval(() => {
      const kind = pickKind();
      setItems((prev) => [
        ...prev,
        {
          id: idRef.current++,
          kind,
          emoji: pickEmoji(kind),
          x: Math.floor(Math.random() * (maxX + 1)),
          bornAt: Date.now(),
          tapped: false,
        },
      ]);
    }, SPAWN_MS);
    return () => clearInterval(i);
  }, [phase, maxX]);

  // Tick — prune items that have fallen off-screen.
  useEffect(() => {
    if (phase !== "playing") return;
    const i = setInterval(() => {
      setItems((prev) => prev.filter((it) => Date.now() - it.bornAt < FALL_DURATION_MS));
    }, TICK_MS);
    return () => clearInterval(i);
  }, [phase]);

  const tap = (it: FallingItem) => {
    if (phase !== "playing" || it.tapped) return;
    setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, tapped: true } : p)));
    if (it.kind === "diamond") { diamondRef.current += 1; setDiamond(diamondRef.current); }
    if (it.kind === "gold")    { goldRef.current += 1;    setGold(goldRef.current); }
    if (it.kind === "silver")  { silverRef.current += 1;  setSilver(silverRef.current); }
    if (it.kind === "bomb")    { bombsRef.current += 1;   setBombs(bombsRef.current); }
    // Remove tapped item right away.
    setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== it.id)), 120);
  };

  const start = () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    reset();
    setPhase("playing");
  };

  const score = diamond * tapCfg.diamond + gold * tapCfg.gold + silver * tapCfg.silver - bombs * tapCfg.bomb;

  if (maint.enabled) return <MaintenanceCard title="Tap-the-Coin Rush" note={maint.note} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tap-the-Coin Rush</Text>
        <Coins size={22} color={theme.colors.primary} />
      </View>

      {phase === "idle" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>30 seconds. Tap fast!</Text>
          <View style={styles.tapLegend}>
            <Text style={styles.tapLegendRow}>💎🎁 Diamonds (rare) +{tapCfg.diamond}pts</Text>
            <Text style={styles.tapLegendRow}>🪙 Gold (rare) +{tapCfg.gold}pts</Text>
            <Text style={styles.tapLegendRow}>🟤🔵🟣🟢🟠🟡 Silver +{tapCfg.silver}pts</Text>
            <Text style={styles.tapLegendRow}>💣⚫🌚☣️ Bomb -{tapCfg.bomb}pts</Text>
          </View>
          <Text style={[styles.subtle, { marginTop: 6 }]} testID="tap-chances">
            Chances left: {session.chancesLeft} / 5
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="tap-start">
            <Text style={styles.startBtnTxt}>
              {(!session.hasUnlocked || session.chancesLeft <= 0) ? "Watch Ad to Get Chances" : "Start Round"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "playing" && (
        <View style={styles.playArea}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}><Text style={styles.statLabel}>TIME</Text><Text style={[styles.statValue, timeLeft <= 5 && { color: "#EF4444" }]}>{timeLeft}s</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>SCORE</Text><Text style={styles.statValue}>{Math.max(0, score)}</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>💎</Text><Text style={styles.statValue}>{diamond}</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>💣</Text><Text style={styles.statValue}>{bombs}</Text></View>
          </View>
          <View style={[styles.canvas, { height: playAreaH, marginHorizontal: margin }]}>
            {items.map((it) => {
              const elapsed = Date.now() - it.bornAt;
              const progress = Math.min(1, elapsed / FALL_DURATION_MS);
              const y = progress * (playAreaH - itemSize);
              return (
                <Pressable
                  key={it.id}
                  onPress={() => tap(it)}
                  testID={`tap-item-${it.kind}`}
                  style={[
                    styles.item,
                    { left: it.x, top: y, width: itemSize, height: itemSize, opacity: it.tapped ? 0 : 1 },
                    it.kind === "diamond" && styles.diamond,
                    it.kind === "gold" && styles.gold,
                    it.kind === "silver" && styles.silver,
                    it.kind === "bomb" && styles.bomb,
                  ]}
                >
                  <Text style={styles.itemEmoji}>{it.emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {phase === "done" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>{"Time's up! ⏱️"}</Text>
          <Text style={styles.scoreTxt}>{Math.max(0, score)} pts</Text>
          <Text style={styles.subtle}>
            💎 {diamond}  •  🪙 {gold}  •  🟡 {silver}  •  💣 {bombs}
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="tap-restart">
            <Text style={styles.startBtnTxt}>Play Again</Text>
          </TouchableOpacity>
        </View>
      )}

      <RewardedAdModal
        visible={showRewardedAd}
        duration={3}
        onReward={() => {
          setShowRewardedAd(false);
          session.grantChances();
        }}
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
            <View style={styles.popupIcon}><Trophy size={42} color={theme.colors.success} /></View>
            <Text style={styles.popupTitle}>
              {winPopup && winPopup.points > 0 ? "Rush complete! 🎉" : "Rush complete"}
            </Text>
            <Text style={styles.popupSub}>
              💎 {winPopup?.diamond ?? 0}  •  🪙 {winPopup?.gold ?? 0}  •  🟡 {winPopup?.silver ?? 0}  •  💣 {winPopup?.bombs ?? 0}
            </Text>
            <View style={styles.popupRow}>
              <Coins size={20} color={theme.colors.primary} />
              <Text style={styles.popupPoints} testID="tap-win-points">
                {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No reward"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => setWinPopup(null)}
              testID="tap-popup-close"
            >
              <Text style={styles.popupBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.adWrap}>
        <NativeAd testID="tap-native-ad" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { flex: 1, alignSelf: "stretch" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  bigTxt: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginVertical: 4, textAlign: "center" },
  subtle: { color: theme.colors.muted, fontSize: 13, marginTop: 10, textAlign: "center" },
  tapLegend: { marginTop: 14, gap: 8, alignSelf: "stretch", paddingHorizontal: 24 },
  tapLegendRow: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
  startBtn: { marginTop: 28, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 16, borderRadius: theme.radii.pill },
  startBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  playArea: { flex: 1, paddingTop: 4 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 10 },
  statBox: { alignItems: "center" },
  statLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: "800", letterSpacing: 1 },
  statValue: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  canvas: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    overflow: "hidden",
    position: "relative",
  },
  item: {
    position: "absolute",
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  diamond: { backgroundColor: "rgba(168,85,247,0.18)", borderWidth: 2, borderColor: "#A855F7" },
  gold: { backgroundColor: "rgba(245,158,11,0.18)", borderWidth: 2, borderColor: "#F59E0B" },
  silver: { backgroundColor: "rgba(148,163,184,0.18)", borderWidth: 2, borderColor: "#94A3B8" },
  bomb: { backgroundColor: "rgba(239,68,68,0.18)", borderWidth: 2, borderColor: "#EF4444" },
  itemEmoji: { fontSize: 22 },
  scoreTxt: { fontSize: 32, fontWeight: "900", color: theme.colors.primary, marginTop: 12 },
  popupOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center", padding: theme.spacing.lg },
  popupCard: { backgroundColor: theme.colors.surface, width: "100%", maxWidth: 320, borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 6 },
  popupIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(16,185,129,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupSub: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  popupPoints: { fontSize: 26, fontWeight: "900", color: theme.colors.primary },
  popupBtn: { marginTop: 16, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
