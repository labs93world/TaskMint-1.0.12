import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Calculator, Trophy, Coins } from "lucide-react-native";
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

const ROUND_SECONDS = 20;
const MAX_QUESTIONS = 20;
const OPS = ["+", "-", "×"] as const;

type Problem = { a: number; b: number; op: typeof OPS[number]; options: number[]; answer: number };

function makeProblem(): Problem {
  const op = OPS[Math.floor(Math.random() * OPS.length)];
  let a = 0, b = 0, answer = 0;
  if (op === "+") { a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; answer = a + b; }
  else if (op === "-") { a = Math.floor(Math.random() * 80) + 20; b = Math.floor(Math.random() * a); answer = a - b; }
  else { a = Math.floor(Math.random() * 12) + 2; b = Math.floor(Math.random() * 12) + 2; answer = a * b; }
  const opts = new Set<number>([answer]);
  while (opts.size < 4) {
    const noise = Math.floor(Math.random() * 21) - 10;
    const v = answer + (noise === 0 ? 1 : noise);
    if (v >= 0) opts.add(v);
  }
  const options = Array.from(opts).sort(() => Math.random() - 0.5);
  return { a, b, op, options, answer };
}

type Phase = "idle" | "playing" | "done";

export default function MathSprint() {
  const maint = useMaintenance("/math-sprint");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const mathAdCfg = useGameAdConfig("math");
  const session = useGameSession(mathAdCfg.chances_per_ad, mathAdCfg.every_n, "tm:game:math");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [reward, setReward] = useState<number | null>(null);
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number; correct: number } | null>(null);
  const correctRef = useRef(0);
  const totalRef = useRef(0);
  const startRef = useRef(0);
  const submittedRef = useRef(false);
  // Wall-clock deadline + stable submit ref so answer taps never restart the timer.
  const deadlineRef = useRef(0);
  const submitRef = useRef<() => void>(() => {});

  // First-mount ad gate removed — rewarded ad shows only when user taps Start Sprint.

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const elapsed = Math.round((Date.now() - startRef.current) / 1000);
    try {
      const r = await api<{ reward: number }>(
        "/games/math/play",
        { method: "POST", body: { correct: correctRef.current, total: totalRef.current, time_seconds: elapsed } },
      );
      setReward(r.reward);
      session.consume();
      await refreshUser();
      setWinPopup({ visible: true, points: r.reward, correct: correctRef.current });
    } catch {
      setWinPopup({ visible: true, points: 0, correct: correctRef.current });
    }
  }, [refreshUser, session]);

  useEffect(() => { submitRef.current = submit; }, [submit]);

  // Deadline-based timer: re-renders triggered by answer taps no longer restart it.
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

  const start = () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    submittedRef.current = false;
    correctRef.current = 0;
    totalRef.current = 0;
    setCorrect(0);
    setTotal(0);
    setReward(null);
    setTimeLeft(ROUND_SECONDS);
    setProblem(makeProblem());
    startRef.current = Date.now();
    setPhase("playing");
  };

  const answer = (val: number) => {
    if (!problem || phase !== "playing") return;
    totalRef.current += 1;
    setTotal(totalRef.current);
    if (val === problem.answer) {
      correctRef.current += 1;
      setCorrect(correctRef.current);
    }
    // End round after MAX_QUESTIONS even if timer remains.
    if (totalRef.current >= MAX_QUESTIONS) {
      setPhase("done");
      submit();
      return;
    }
    setProblem(makeProblem());
  };

  if (maint.enabled) return <MaintenanceCard title="Math Sprint" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Math Sprint</Text>
        <Calculator size={22} color={theme.colors.primary} />
      </View>

      {phase === "idle" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>20 seconds. 20 questions.</Text>
          <Text style={styles.subtle} testID="math-chances">
            Chances left: {session.chancesLeft} / 10
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="math-start">
            <Text style={styles.startBtnTxt}>
              {(!session.hasUnlocked || session.chancesLeft <= 0) ? "Watch Ad to Get Chances" : "Start Sprint"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "playing" && problem && (
        <View style={styles.playArea}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}><Text style={styles.statLabel}>TIME</Text><Text style={[styles.statValue, timeLeft <= 5 && { color: "#EF4444" }]}>{timeLeft}s</Text></View>
            <View style={styles.statBox}><Text style={styles.statLabel}>CORRECT</Text><Text style={styles.statValue}>{correct}/{total}</Text></View>
          </View>
          <Text style={styles.question}>{problem.a} {problem.op} {problem.b} = ?</Text>
          <View style={styles.options}>
            {problem.options.map((o) => (
              <TouchableOpacity
                key={o}
                style={styles.optBtn}
                onPress={() => answer(o)}
                testID={`math-opt-${o}`}
                activeOpacity={0.85}
              >
                <Text style={styles.optTxt}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {phase === "done" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>Time's up! ⏱️</Text>
          <Text style={styles.scoreTxt}>{correct}/{total} correct</Text>
          {reward !== null && (
            <Text style={[styles.rewardTxt, reward === 0 && { color: theme.colors.danger }]}>
              {reward > 0 ? `+${reward} pts` : "Need 4+ correct to win"}
            </Text>
          )}
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="math-restart">
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
              {winPopup && winPopup.points > 0 ? "Sprint complete! 🎉" : "Sprint complete"}
            </Text>
            <Text style={styles.popupSub}>{winPopup?.correct ?? 0} correct answers</Text>
            <View style={styles.popupRow}>
              <Coins size={20} color={theme.colors.primary} />
              <Text style={styles.popupPoints} testID="math-win-points">
                {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No reward"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => setWinPopup(null)}
              testID="math-popup-close"
            >
              <Text style={styles.popupBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.adWrap}>
        <NativeAd testID="math-native-ad" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { paddingHorizontal: theme.spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  bigTxt: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginVertical: 4 },
  subtle: { color: theme.colors.muted, fontSize: 13, marginTop: 10, textAlign: "center" },
  startBtn: {
    marginTop: 28, backgroundColor: theme.colors.primary,
    paddingHorizontal: 36, paddingVertical: 16, borderRadius: theme.radii.pill,
  },
  startBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  playArea: { flex: 1, padding: theme.spacing.lg },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 18 },
  statBox: { alignItems: "center" },
  statLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: "800", letterSpacing: 1 },
  statValue: { fontSize: 28, fontWeight: "800", color: theme.colors.text },
  question: { fontSize: 44, fontWeight: "900", color: theme.colors.text, textAlign: "center", marginVertical: 24 },
  options: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  optBtn: {
    width: "48%", marginBottom: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 22, borderRadius: theme.radii.lg, alignItems: "center",
  },
  optTxt: { color: "#fff", fontWeight: "800", fontSize: 24 },
  scoreTxt: { fontSize: 32, fontWeight: "900", color: theme.colors.text, marginTop: 12 },
  rewardTxt: { fontSize: 20, fontWeight: "800", color: theme.colors.primary, marginTop: 8 },
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
