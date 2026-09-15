import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Brain, Trophy, Coins, Flame } from "lucide-react-native";
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

const TOTAL_QUESTIONS = 10;
const QUESTION_SECONDS = 12;

type Question = { q: string; options: string[]; answer: number };

const BANK: Question[] = [
  { q: "Capital of France?", options: ["Berlin", "Madrid", "Paris", "Rome"], answer: 2 },
  { q: "Largest planet in our solar system?", options: ["Earth", "Jupiter", "Saturn", "Neptune"], answer: 1 },
  { q: "Which is a prime number?", options: ["9", "21", "27", "29"], answer: 3 },
  { q: "H2O is the chemical formula of?", options: ["Salt", "Water", "Sugar", "Oxygen"], answer: 1 },
  { q: "Author of Harry Potter?", options: ["J. R. R. Tolkien", "J. K. Rowling", "Dan Brown", "George Orwell"], answer: 1 },
  { q: "Tallest mountain on Earth?", options: ["K2", "Kangchenjunga", "Mt. Everest", "Lhotse"], answer: 2 },
  { q: "Currency of Japan?", options: ["Won", "Yuan", "Yen", "Rupee"], answer: 2 },
  { q: "Speed of light is approximately?", options: ["3×10⁵ km/s", "3×10⁸ m/s", "3×10⁶ m/s", "3×10⁷ m/s"], answer: 1 },
  { q: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Michelangelo"], answer: 2 },
  { q: "What language has the most native speakers?", options: ["English", "Hindi", "Spanish", "Mandarin Chinese"], answer: 3 },
  { q: "Which gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
  { q: "Which country gifted the Statue of Liberty to USA?", options: ["UK", "France", "Spain", "Germany"], answer: 1 },
  { q: "Number of continents?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "Smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Malta"], answer: 1 },
  { q: "Who developed the theory of relativity?", options: ["Newton", "Tesla", "Einstein", "Hawking"], answer: 2 },
  { q: "Square root of 144?", options: ["10", "11", "12", "14"], answer: 2 },
  { q: "Which is NOT a programming language?", options: ["Python", "Java", "HTML", "C++"], answer: 2 },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Mercury", "Saturn"], answer: 1 },
  { q: "Largest ocean?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "Which vitamin do we get from sunlight?", options: ["A", "B12", "C", "D"], answer: 3 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = "idle" | "playing" | "done";

export default function TriviaStreak() {
  const maint = useMaintenance("/trivia-streak");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("trivia");
  const session = useGameSession(adCfg.chances_per_ad, adCfg.every_n, "tm:game:trivia");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number; correct: number; max: number } | null>(null);
  const submittedRef = useRef(false);
  const correctRef = useRef(0);
  const maxStreakRef = useRef(0);
  const streakRef = useRef(0);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const r = await api<{ reward: number; max_streak: number }>("/games/trivia/play", {
        method: "POST",
        body: { correct: correctRef.current, total: TOTAL_QUESTIONS, max_streak: maxStreakRef.current },
      });
      session.consume();
      await refreshUser();
      setWinPopup({ visible: true, points: r.reward, correct: correctRef.current, max: maxStreakRef.current });
    } catch {
      setWinPopup({ visible: true, points: 0, correct: correctRef.current, max: maxStreakRef.current });
    }
  }, [refreshUser, session]);

  const advance = useCallback(() => {
    setSelected(null);
    setTimeLeft(QUESTION_SECONDS);
    setQIdx((i) => {
      const next = i + 1;
      if (next >= TOTAL_QUESTIONS) {
        setPhase("done");
        submit();
      }
      return next;
    });
  }, [submit]);

  const handleAnswer = (idx: number) => {
    if (phase !== "playing" || selected !== null) return;
    setSelected(idx);
    const correct = idx === questions[qIdx].answer;
    if (correct) {
      correctRef.current += 1;
      setCorrectCount(correctRef.current);
      streakRef.current += 1;
      if (streakRef.current > maxStreakRef.current) maxStreakRef.current = streakRef.current;
      setStreak(streakRef.current);
      setMaxStreak(maxStreakRef.current);
    } else {
      streakRef.current = 0;
      setStreak(0);
    }
    setTimeout(advance, 900);
  };

  // Per-question timer.
  useEffect(() => {
    if (phase !== "playing" || selected !== null) return;
    if (qIdx >= TOTAL_QUESTIONS) return;
    const i = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(i);
          // Treat timeout as wrong answer: reset streak and advance.
          streakRef.current = 0;
          setStreak(0);
          setSelected(-1); // sentinel so options don't accept further input
          setTimeout(advance, 700);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [phase, selected, qIdx, advance]);

  const start = () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    submittedRef.current = false;
    correctRef.current = 0;
    streakRef.current = 0;
    maxStreakRef.current = 0;
    setCorrectCount(0);
    setStreak(0);
    setMaxStreak(0);
    setQIdx(0);
    setSelected(null);
    setTimeLeft(QUESTION_SECONDS);
    setQuestions(shuffle(BANK).slice(0, TOTAL_QUESTIONS).map((q) => {
      // Shuffle option order while keeping track of the correct index.
      const opts = q.options.map((text, i) => ({ text, isCorrect: i === q.answer }));
      const shuffled = shuffle(opts);
      const newAnswer = shuffled.findIndex((o) => o.isCorrect);
      return { q: q.q, options: shuffled.map((o) => o.text), answer: newAnswer };
    }));
    setPhase("playing");
  };

  if (maint.enabled) return <MaintenanceCard title="Trivia Streak" note={maint.note} />;

  const current = phase === "playing" && qIdx < TOTAL_QUESTIONS ? questions[qIdx] : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Trivia Streak</Text>
        <Brain size={22} color={theme.colors.primary} />
      </View>

      {phase === "idle" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>10 questions. 12s each.</Text>
          <Text style={styles.subtle} testID="trivia-chances">
            Chances left: {session.chancesLeft} / 5
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="trivia-start">
            <Text style={styles.startBtnTxt}>
              {(!session.hasUnlocked || session.chancesLeft <= 0) ? "Watch Ad to Get Chances" : "Start Trivia"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "playing" && current && (
        <View style={styles.playArea}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Q</Text>
              <Text style={styles.statValue}>{qIdx + 1}/{TOTAL_QUESTIONS}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TIME</Text>
              <Text style={[styles.statValue, timeLeft <= 3 && { color: "#EF4444" }]}>{timeLeft}s</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>STREAK</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Flame size={16} color="#F59E0B" />
                <Text style={styles.statValue}>{streak}</Text>
              </View>
            </View>
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionTxt}>{current.q}</Text>
          </View>

          <View style={styles.options}>
            {current.options.map((opt, i) => {
              const isPicked = selected === i;
              const isCorrect = current.answer === i;
              const revealing = selected !== null;
              const bg =
                !revealing ? theme.colors.surface
                : isPicked && isCorrect ? "#D1FAE5"
                : isPicked && !isCorrect ? "#FEE2E2"
                : isCorrect ? "#D1FAE5"
                : theme.colors.surface;
              const border =
                !revealing ? theme.colors.border
                : isCorrect ? "#10B981"
                : isPicked ? "#EF4444"
                : theme.colors.border;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.optBtn, { backgroundColor: bg, borderColor: border }]}
                  onPress={() => handleAnswer(i)}
                  disabled={selected !== null}
                  activeOpacity={0.85}
                  testID={`trivia-opt-${i}`}
                >
                  <Text style={styles.optTxt}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {phase === "done" && (
        <View style={styles.center}>
          <Text style={styles.bigTxt}>All done! 🎯</Text>
          <Text style={styles.scoreTxt}>{correctCount}/{TOTAL_QUESTIONS} correct</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Flame size={20} color="#F59E0B" />
            <Text style={styles.subtle}>Best streak: {maxStreak}</Text>
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={start} testID="trivia-restart">
            <Text style={styles.startBtnTxt}>Play Again</Text>
          </TouchableOpacity>
        </View>
      )}

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
            <View style={styles.popupIcon}><Trophy size={42} color={theme.colors.success} /></View>
            <Text style={styles.popupTitle}>
              {winPopup && winPopup.points > 0 ? "Trivia complete! 🎉" : "Trivia complete"}
            </Text>
            <Text style={styles.popupSub}>
              {winPopup?.correct ?? 0}/{TOTAL_QUESTIONS} correct • best streak {winPopup?.max ?? 0}
            </Text>
            <View style={styles.popupRow}>
              <Coins size={20} color={theme.colors.primary} />
              <Text style={styles.popupPoints} testID="trivia-win-points">
                {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No reward"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => setWinPopup(null)}
              testID="trivia-popup-close"
            >
              <Text style={styles.popupBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.adWrap}>
        <NativeAd testID="trivia-native-ad" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  bigTxt: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginVertical: 4, textAlign: "center" },
  subtle: { color: theme.colors.muted, fontSize: 13, marginTop: 10, textAlign: "center" },
  startBtn: { marginTop: 28, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 16, borderRadius: theme.radii.pill },
  startBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  playArea: { flex: 1, padding: theme.spacing.lg },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  statBox: { alignItems: "center" },
  statLabel: { fontSize: 11, color: theme.colors.muted, fontWeight: "800", letterSpacing: 1 },
  statValue: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  questionCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl,
    padding: theme.spacing.lg, marginBottom: theme.spacing.md, minHeight: 110,
    alignItems: "center", justifyContent: "center",
  },
  questionTxt: { fontSize: 19, fontWeight: "800", color: theme.colors.text, textAlign: "center", lineHeight: 26 },
  options: { gap: 10 },
  optBtn: {
    borderWidth: 2, borderRadius: theme.radii.lg,
    paddingVertical: 16, paddingHorizontal: 18,
  },
  optTxt: { color: theme.colors.text, fontWeight: "700", fontSize: 15 },
  scoreTxt: { fontSize: 32, fontWeight: "900", color: theme.colors.text, marginTop: 12 },
  popupOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center", padding: theme.spacing.lg },
  popupCard: { backgroundColor: theme.colors.surface, width: "100%", maxWidth: 320, borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 6 },
  popupIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: "rgba(16,185,129,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupSub: { fontSize: 13, color: theme.colors.muted, marginTop: 2, textAlign: "center" },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  popupPoints: { fontSize: 26, fontWeight: "900", color: theme.colors.primary },
  popupBtn: { marginTop: 16, backgroundColor: theme.colors.primary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
