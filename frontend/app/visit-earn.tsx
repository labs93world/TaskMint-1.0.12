import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform, AppState, AppStateStatus, Modal,
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { ChevronLeft, Globe, Check, Gift, Clock, AlertTriangle } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import { storage } from "../src/utils/storage";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import NativeAd from "../src/components/NativeAd";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type Site = { id: string; title: string; url: string; active: boolean };
type Phase = "idle" | "waiting_return" | "claim_ready";

// User must spend at least this long OUTSIDE the app (i.e. actually visiting the site)
// before the reward becomes claimable.
const REQUIRED_AWAY_MS = 10_000;
const VISIT_STATE_KEY = "tm:visit:active"; // persisted { siteId, leftAt }

type PersistedVisit = { siteId: string; siteTitle: string; siteUrl: string; leftAt: number };

export default function VisitEarn() {
  const maint = useMaintenance("/visit-earn");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adVisible, setAdVisible] = useState(false);
  const [active, setActive] = useState<Site | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tooFastPopup, setTooFastPopup] = useState<{ siteTitle: string; secondsAway: number } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const leftAtRef = useRef<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, done] = await Promise.all([
        api<Site[]>("/visit-sites"),
        api<{ site_ids: string[] }>("/tasks/visit/completed-today"),
      ]);
      setSites(list);
      setDoneIds(done.site_ids || []);
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Could not load sites" });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // On screen mount, restore any in-flight visit so the timer survives an app kill.
  useEffect(() => {
    (async () => {
      const persisted = await storage.getItem<PersistedVisit | null>(VISIT_STATE_KEY, null as any);
      if (persisted && persisted.siteId && persisted.leftAt) {
        leftAtRef.current = persisted.leftAt;
        setActive({ id: persisted.siteId, title: persisted.siteTitle, url: persisted.siteUrl, active: true });
        const awayMs = Date.now() - persisted.leftAt;
        if (awayMs >= REQUIRED_AWAY_MS) setPhase("claim_ready");
        else setPhase("waiting_return");
      }
    })();
  }, []);

  // Detect app foreground / background transitions to measure "away" time.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Leaving the app while a visit is pending — start measuring.
      if (phase === "waiting_return" && prev === "active" && next.match(/inactive|background/)) {
        leftAtRef.current = Date.now();
        if (active) {
          storage.setItem(VISIT_STATE_KEY, {
            siteId: active.id, siteTitle: active.title, siteUrl: active.url, leftAt: leftAtRef.current,
          } as any).catch(() => {});
        }
      }

      // Returning to the app while a visit is pending — decide based on time spent away.
      if (phase === "waiting_return" && prev.match(/inactive|background/) && next === "active") {
        const leftAt = leftAtRef.current;
        const awayMs = leftAt ? Date.now() - leftAt : 0;
        if (!leftAt || awayMs < REQUIRED_AWAY_MS) {
          // Came back too quickly — show the retry popup.
          const siteTitle = active?.title || "the site";
          setTooFastPopup({ siteTitle, secondsAway: Math.max(0, Math.floor(awayMs / 1000)) });
          setActive(null);
          setPhase("idle");
          leftAtRef.current = 0;
          storage.removeItem(VISIT_STATE_KEY).catch(() => {});
        } else {
          setPhase("claim_ready");
        }
      }
    });
    return () => sub.remove();
  }, [phase, active]);

  const start = async (s: Site) => {
    if (phase !== "idle") return;
    if (doneIds.includes(s.id)) {
      toast.error("Already completed", { description: "You've already earned from this site today. Try another." });
      return;
    }
    setActive(s);
    setPhase("waiting_return");
    leftAtRef.current = 0; // will be set when AppState goes background.
    try {
      const supported = await Linking.canOpenURL(s.url);
      if (supported) {
        await Linking.openURL(s.url);
      } else if (Platform.OS === "web") {
        window.open(s.url, "_blank");
      } else {
        toast.error("Invalid URL", { description: `Cannot open ${s.url}` });
        setActive(null);
        setPhase("idle");
        return;
      }
    } catch {
      toast.error("Error", { description: `Could not open ${s.url}` });
      setActive(null);
      setPhase("idle");
      return;
    }

    // Web fallback: the browser doesn't fire AppState background. Mark `leftAt` now
    // so the 10-second rule still applies based on opening time.
    if (Platform.OS === "web") {
      leftAtRef.current = Date.now();
      storage.setItem(VISIT_STATE_KEY, {
        siteId: s.id, siteTitle: s.title, siteUrl: s.url, leftAt: leftAtRef.current,
      } as any).catch(() => {});
    }
  };

  const onClaim = () => {
    if (phase !== "claim_ready") return;
    setAdVisible(true);
  };

  const onReward = async () => {
    setAdVisible(false);
    if (!active) {
      setPhase("idle");
      return;
    }
    try {
      const r = await api<{ reward: number }>("/tasks/visit", {
        method: "POST",
        body: { site_id: active.id },
      });
      setDoneIds((d) => [...d, active.id]);
      await refreshUser();
      toast.success("Reward earned", { description: `+${r.reward} points!` });
    } catch (e: any) {
      toast.error("Error", { description: e?.message || "Try again" });
    } finally {
      setActive(null);
      setPhase("idle");
      leftAtRef.current = 0;
      await storage.removeItem(VISIT_STATE_KEY).catch(() => {});
    }
  };

  const allCompleted = !loading && sites.length > 0 && doneIds.length >= sites.length;
  const otherTasksDisabled = phase !== "idle";

  if (maint.enabled) return <MaintenanceCard title="Visit & Earn" note={maint.note} />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Visit & Earn</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: 12, paddingBottom: 100 }}>
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
        ) : sites.length === 0 ? (
          <>
            <Text style={styles.empty}>No sites available right now. Check back soon.</Text>
            <NativeAd testID="visit-native-ad-empty" />
          </>
        ) : allCompleted ? (
          <View style={styles.doneCard} testID="visit-all-done">
            <View style={styles.doneIcon}><Check size={32} color={theme.colors.success} /></View>
            <Text style={styles.doneTitle}>All Done!</Text>
            <Text style={styles.doneBody}>Daily limit reached. Come back tomorrow.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.intro}>
              Visit partner sites and stay on them for at least <Text style={styles.bold}>10 seconds</Text> to earn 30-100 points each. One reward per site per day.
            </Text>

            {/* Active visit pending — waiting / claim banner */}
            {active && phase !== "idle" && (
              <View style={styles.pendingCard} testID="visit-pending">
                <View style={styles.pendingIcon}>
                  {phase === "claim_ready"
                    ? <Gift size={28} color={theme.colors.success} />
                    : <Clock size={28} color={theme.colors.primary} />}
                </View>
                <Text style={styles.pendingTitle} numberOfLines={1}>{active.title}</Text>
                {phase === "waiting_return" && (
                  <Text style={styles.pendingSub}>
                    Open the site and stay for at least 10 seconds, then return here to claim your reward.
                  </Text>
                )}
                {phase === "claim_ready" && (
                  <TouchableOpacity
                    style={styles.claimBtn}
                    onPress={onClaim}
                    testID="visit-claim-btn"
                    activeOpacity={0.85}
                  >
                    <Gift size={18} color="#fff" />
                    <Text style={styles.claimBtnTxt}>Claim Reward</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <NativeAd testID="visit-native-ad" />
            {sites.map((s) => {
              const d = doneIds.includes(s.id);
              const isActiveItem = active?.id === s.id;
              const disabled = d || (otherTasksDisabled && !isActiveItem) || isActiveItem;
              return (
                <TouchableOpacity
                  key={s.id} onPress={() => start(s)} disabled={disabled}
                  activeOpacity={0.85}
                  style={[styles.row, (d || disabled) && { opacity: 0.55 }]}
                  testID={`visit-${s.id}`}
                >
                  <View style={[styles.icon, d && { backgroundColor: "rgba(16,185,129,0.12)" }]}>
                    {d ? <Check size={24} color={theme.colors.success} /> : <Globe size={28} color={theme.colors.primary} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rtitle} numberOfLines={1}>{s.title}</Text>
                    <Text style={styles.rsub} numberOfLines={1}>{s.url}</Text>
                  </View>
                  <Text style={styles.rwd}>+30-100</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <InterstitialAdModal visible={adVisible} onDone={onReward} duration={3} />

      {/* Came-back-too-soon popup */}
      <Modal visible={!!tooFastPopup} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View style={styles.popupIcon}>
              <AlertTriangle size={42} color="#F59E0B" />
            </View>
            <Text style={styles.popupTitle}>Visit incomplete</Text>
            <Text style={styles.popupSub}>
              You returned after only <Text style={styles.bold}>{tooFastPopup?.secondsAway ?? 0}s</Text>. To earn the reward, please explore <Text style={styles.bold}>{tooFastPopup?.siteTitle}</Text> for at least <Text style={styles.bold}>10 seconds</Text> and try again.
            </Text>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => setTooFastPopup(null)}
              testID="visit-too-fast-close"
              activeOpacity={0.85}
            >
              <Text style={styles.popupBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  intro: { color: theme.colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  bold: { color: theme.colors.text, fontWeight: "800" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface, padding: theme.spacing.md,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
  },
  icon: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  rtitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  rsub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  rwd: { color: theme.colors.success, fontSize: 14, fontWeight: "800" },
  empty: { textAlign: "center", color: theme.colors.muted, marginTop: 12, fontWeight: "600" },
  pendingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  pendingIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  pendingTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  pendingSub: { color: theme.colors.muted, fontSize: 13, textAlign: "center", paddingHorizontal: 6 },
  claimBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.colors.success,
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 999, marginTop: 6,
  },
  claimBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  doneCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl, padding: theme.spacing.lg,
    alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.colors.border,
    marginTop: 24,
  },
  doneIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(16,185,129,0.12)", alignItems: "center", justifyContent: "center",
  },
  doneTitle: { fontSize: 26, fontWeight: "800", color: theme.colors.success },
  doneBody: { color: theme.colors.muted, textAlign: "center" },

  popupOverlay: {
    flex: 1, backgroundColor: theme.colors.overlay,
    justifyContent: "center", alignItems: "center", padding: theme.spacing.lg,
  },
  popupCard: {
    backgroundColor: theme.colors.surface, width: "100%", maxWidth: 340,
    borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 8,
  },
  popupIcon: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(245,158,11,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupSub: { fontSize: 14, color: theme.colors.muted, textAlign: "center", lineHeight: 20 },
  popupBtn: {
    marginTop: 14, backgroundColor: theme.colors.primary,
    paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill,
  },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
