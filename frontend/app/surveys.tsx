import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { ChevronLeft, ClipboardCheck, Check, Clock } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import NativeAd from "../src/components/NativeAd";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type Question = { q: string; options: string[] };
type Survey = { id: string; title: string; time: string; reward: number; questions: Question[] };

type Stage = "intro" | "answering" | "summary";

export default function Surveys() {
  const maint = useMaintenance("/surveys");
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyIdx, setSurveyIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("intro");
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [adAcknowledged, setAdAcknowledged] = useState(true);

  const used = user?.daily_surveys_used ?? 0;
  const left = Math.max(0, 5 - used);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<Survey[]>("/tasks/surveys/random?limit=1");
      setSurveys(list);
      setSurveyIdx(0);
      setStage("intro");
      setQIdx(0);
      setPicked(null);
      setReward(0);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Could not load surveys" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Pull a fresh batch of 5 random surveys every time the screen is focused.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const current = surveys[surveyIdx];
  const currentQuestion = current?.questions?.[qIdx];

  const startSurvey = () => {
    setStage("answering");
    setQIdx(0);
    setPicked(null);
  };

  const submitTask = async () => {
    if (left <= 0) {
      toast.info("Daily limit reached", { description: "Come back tomorrow for more surveys." });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ reward: number }>("/tasks/survey", { method: "POST" });
      setReward(r.reward);
      await refreshUser();
      setAdAcknowledged(false);
      setShowInterstitial(true);
      setStage("summary");
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Try again" });
    } finally {
      setSubmitting(false);
    }
  };

  const pickAnswer = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    // Auto-advance after a short delay so the highlight registers.
    setTimeout(() => {
      const totalQs = current?.questions?.length ?? 0;
      if (qIdx + 1 < totalQs) {
        setQIdx(qIdx + 1);
        setPicked(null);
        return;
      }
      // Survey complete — go to next survey or finish task.
      if (surveyIdx + 1 < surveys.length) {
        setSurveyIdx(surveyIdx + 1);
        setStage("intro");
        setQIdx(0);
        setPicked(null);
      } else {
        // All 5 surveys complete → submit and credit.
        submitTask();
      }
    }, 350);
  };

  if (maint.enabled) return <MaintenanceCard title="Surveys" note={maint.note} />;

  if (loading || surveys.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Surveys</Text>
          <View style={{ width: 26 }} />
        </View>
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 64 }} />
      </SafeAreaView>
    );
  }

  if (left <= 0 && stage !== "summary") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="back-btn">
            <ChevronLeft size={26} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Surveys</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.body}>
          <View style={styles.doneCard} testID="surveys-limit-reached">
            <View style={styles.doneIcon}><Check size={32} color={theme.colors.success} /></View>
            <Text style={styles.doneTitle}>All Done!</Text>
            <Text style={styles.doneBody}>Daily limit reached. Come back tomorrow.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Surveys</Text>
        <Text style={styles.counter}>
          {stage === "answering" ? `S${surveyIdx + 1} • Q${qIdx + 1}/${current?.questions?.length ?? 5}` : `${surveyIdx + 1}/${surveys.length}`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>1 survey per task • 5 tasks per day • {left}/5 left</Text>

        <InterstitialAdModal
          visible={showInterstitial}
          onDone={() => { setShowInterstitial(false); setAdAcknowledged(true); }}
          duration={3}
        />

        {stage === "intro" && current && (
          <View style={styles.card}>
            <View style={styles.qIcon}><ClipboardCheck color={theme.colors.primary} size={28} /></View>
            <Text style={styles.q}>{current.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Clock size={12} color={theme.colors.muted} />
                <Text style={styles.metaPillTxt}>~{current.time}</Text>
              </View>
              <View style={[styles.metaPill, { backgroundColor: "rgba(16,185,129,0.10)" }]}>
                <Text style={[styles.metaPillTxt, { color: theme.colors.success }]}>+{current.reward} pts est.</Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaPillTxt}>5 quick questions</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={startSurvey}
              testID="survey-take-btn"
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnTxt}>Take this survey</Text>
            </TouchableOpacity>
            <NativeAd testID="surveys-native-ad-intro" />
          </View>
        )}

        {stage === "answering" && current && currentQuestion && (
          <View style={styles.card}>
            <View style={styles.qIcon}><ClipboardCheck color={theme.colors.primary} size={28} /></View>
            <Text style={styles.surveyHint} numberOfLines={2}>{current.title}</Text>
            <Text style={styles.q}>{currentQuestion.q}</Text>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(((qIdx + (picked !== null ? 1 : 0)) / (current.questions.length || 1)) * 100)}%`,
                  },
                ]}
              />
            </View>

            <View style={styles.optionsCol}>
              {currentQuestion.options.map((opt, i) => {
                const isPicked = picked === i;
                return (
                  <TouchableOpacity
                    key={`${qIdx}-${i}`}
                    style={[
                      styles.opt,
                      isPicked && styles.optPicked,
                      picked !== null && !isPicked && { opacity: 0.55 },
                    ]}
                    onPress={() => pickAnswer(i)}
                    disabled={picked !== null}
                    activeOpacity={0.85}
                    testID={`survey-opt-${i}`}
                  >
                    <Text style={[styles.optText, isPicked && styles.optTextPicked]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <NativeAd testID="surveys-native-ad-active" />
          </View>
        )}

        {stage === "summary" && (
          <View style={styles.doneCard} testID="surveys-done">
            <View style={styles.doneIcon}><Check size={32} color={theme.colors.success} /></View>
            <Text style={styles.doneTitle}>+{reward} points</Text>
            <Text style={styles.doneBody}>Great job! Keep going to earn more.</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, (left <= 0 || !adAcknowledged || submitting) && { backgroundColor: theme.colors.muted }]}
              onPress={load}
              disabled={left <= 0 || !adAcknowledged || submitting}
              testID="surveys-restart"
            >
              <Text style={styles.primaryBtnTxt}>
                {left <= 0 ? "Come back tomorrow" : (!adAcknowledged ? "Watching ad…" : "Play again")}
              </Text>
            </TouchableOpacity>
            <NativeAd testID="surveys-native-ad-after" />
          </View>
        )}
      </ScrollView>
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
  counter: { color: theme.colors.muted, fontWeight: "700", fontSize: 13 },
  body: { padding: theme.spacing.lg, gap: 16 },
  intro: { color: theme.colors.muted, fontSize: 13 },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  qIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  surveyHint: { fontSize: 12, color: theme.colors.muted, fontWeight: "700", marginBottom: 6 },
  q: { fontSize: 20, fontWeight: "800", color: theme.colors.text, lineHeight: 26 },

  metaRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: theme.spacing.md, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  metaPillTxt: { fontSize: 11, fontWeight: "800", color: theme.colors.muted },

  progressTrack: {
    height: 6, backgroundColor: theme.colors.bg, borderRadius: 3,
    marginTop: 14, marginBottom: 14, overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: theme.colors.primary, borderRadius: 3 },

  optionsCol: { gap: 10 },
  opt: {
    backgroundColor: theme.colors.bg,
    borderWidth: 2, borderColor: theme.colors.border,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: theme.radii.md,
  },
  optPicked: {
    backgroundColor: "rgba(16,185,129,0.10)",
    borderColor: theme.colors.success,
  },
  optText: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  optTextPicked: { color: theme.colors.success },

  primaryBtn: {
    backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.radii.md,
    alignItems: "center", marginTop: 4,
  },
  primaryBtnTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },

  doneCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl, padding: theme.spacing.lg,
    alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.colors.border,
  },
  doneIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(16,185,129,0.12)", alignItems: "center", justifyContent: "center",
  },
  doneTitle: { fontSize: 26, fontWeight: "800", color: theme.colors.success },
  doneBody: { color: theme.colors.muted, textAlign: "center" },
});
