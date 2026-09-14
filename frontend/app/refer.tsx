import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl
} from "react-native";
import { toast } from "sonner-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Copy, Share2, Users, Gift, Check, UserPlus } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../src/context/AuthContext";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type ReferralInfo = {
  referral_code: string;
  referred_by: string | null;
  referrer_name: string | null;
  referrer_code: string | null;
  count: number;
  total_earned_points: number;
  total_earned_inr: number;
  can_apply: boolean;
  hero_title: string;
  hero_subtitle: string;
  how_it_works_step3: string;
  sharing_text?: string;
};

type ReferralEntry = {
  user_id: string; name: string; streak: number;
  last_checkin?: string | null; joined_at?: string | null;
  rewards_paid: number[];
};

export default function ReferScreen() {
  const maint = useMaintenance("/refer");
  const { user, refreshUser } = useAuth();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [history, setHistory] = useState<ReferralEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<ReferralInfo>("/referrals/me");
      setInfo(data);
    } catch {}
    try {
      const h = await api<ReferralEntry[]>("/referrals/history");
      setHistory(h);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const code = info?.referral_code || "";
  const message =
    (info?.sharing_text || "🎉 Join me on TaskMint and earn real cash! Use my code {code} when signing up.")
      .replace(/\{code\}/g, code);

  const copy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      toast.success("Copied", { description: "Referral code copied to clipboard" })
    } catch {}
  };

  const share = async () => {
    if (!code) return;
    try { await Share.share({ message }); } catch {}
  };

  const onApply = async () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) {
      toast.info("Enter code", { description: "Please enter a referral code" })
      return;
    }
    setApplying(true);
    try {
      const r = await api<{ referrer_name: string; referrer_code: string }>(
        "/referrals/apply",
        { method: "POST", body: { code: c } },
      );
      toast.success("Applied!", { description: `You're now referred by ${r.referrer_name} (${r.referrer_code}).` });
      setCodeInput("");
      await refreshUser();
      await load();
    } catch (e: any) {
      toast.error("Could not apply", { description: e?.message || "Failed" })
    } finally {
      setApplying(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const showApplyForm = info?.can_apply === true;
  const alreadyReferred = !!info?.referred_by;

  if (maint.enabled) return <MaintenanceCard title="Refer & Earn" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.title}>Refer & Earn</Text>

          <View style={styles.heroWrap}>
            <LinearGradient
              colors={["#4F46E5", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroWatermark} pointerEvents="none">
                <Gift size={180} color="rgba(255,255,255,0.18)" />
              </View>
              <View style={styles.heroIcon}>
                <Gift size={32} color="#fff" />
              </View>
              <Text style={styles.heroTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                {info?.hero_title || "Earn ₹10 per friend"}
              </Text>
              <Text style={styles.heroBody} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>
                {info?.hero_subtitle || "₹10 at 7-day streak • ₹20 at 15-day streak"}
              </Text>
            </LinearGradient>
          </View>

          <Text style={styles.label}>YOUR REFERRAL CODE (YOUR NAME)</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code} testID="referral-code">{code}</Text>
            <TouchableOpacity onPress={copy} style={styles.copyBtn} testID="copy-code-btn">
              <Copy size={16} color={theme.colors.primary} />
              <Text style={styles.copyText}>Copy</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.85} onPress={share} testID="share-code-btn" style={styles.shareBtnWrap}>
            <LinearGradient
              colors={["#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shareBtn}
            >
              <Share2 size={18} color="#fff" />
              <Text style={styles.shareText}>Share with Friends</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Apply referral code (only before first check-in & if not already referred) */}
          {showApplyForm && (
            <View style={styles.applyCard}>
              <View style={styles.applyHeader}>
                <UserPlus size={18} color={theme.colors.primary} />
                <Text style={styles.applyTitle}>Have a friend's code?</Text>
              </View>
              <Text style={styles.applySub}>
                Apply their referral code before you do your first daily check-in. Once you check in,
                this form will be locked.
              </Text>
              <View style={styles.applyRow}>
                <TextInput
                  value={codeInput}
                  onChangeText={(t) => setCodeInput(t.replace(/\s/g, "").toUpperCase())}
                  placeholder="Enter code (e.g. ALTAF)"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  autoCapitalize="characters"
                  maxLength={22}
                  testID="apply-code-input"
                />
                <TouchableOpacity
                  onPress={onApply}
                  disabled={applying || !codeInput}
                  style={[styles.applyBtn, (applying || !codeInput) && { opacity: 0.6 }]}
                  testID="apply-code-btn"
                >
                  <Text style={styles.applyBtnText}>{applying ? "Applying..." : "Apply"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {alreadyReferred && (
            <View style={[styles.applyCard, { borderColor: theme.colors.success }]}>
              <View style={styles.applyHeader}>
                <Check size={18} color={theme.colors.success} />
                <Text style={[styles.applyTitle, { color: theme.colors.success }]}>Referral applied</Text>
              </View>
              <Text style={styles.applySub}>
                You were referred by <Text style={{ fontWeight: "800", color: theme.colors.text }}>
                  {info?.referrer_name}
                </Text> (code: {info?.referrer_code}).
              </Text>
            </View>
          )}

          {!showApplyForm && !alreadyReferred && (
            <View style={styles.applyCardLocked}>
              <Text style={styles.lockedText}>
                You can no longer apply a referral code — you've already made your first daily check-in.
              </Text>
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <View style={styles.statIcon}><Users size={18} color={theme.colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statTitle}>Friends invited</Text>
                <Text style={styles.statSub}>Users who applied your code</Text>
              </View>
              <Text style={styles.statValue} testID="stat-count">{info?.count ?? 0}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: "rgba(16,185,129,0.10)" }]}>
                <Gift size={18} color={theme.colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statTitle}>Referral earnings</Text>
                <Text style={styles.statSub}>
                  {info?.total_earned_points ?? 0} pts earned
                </Text>
              </View>
              <Text style={[styles.statValue, { color: theme.colors.success }]} testID="stat-earned">
                ₹{info?.total_earned_inr?.toFixed(0) ?? 0}
              </Text>
            </View>
          </View>

          <Text style={styles.howTitle}>How it works</Text>
          {[
            "Share your unique code with friends",
            "They sign up and apply your code before their first check-in",
            info?.how_it_works_step3 || "₹10 when they hit a 7-day streak • ₹20 when they hit a 15-day streak",
          ].map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}

          {history.length > 0 && (
            <>
              <Text style={[styles.howTitle, { marginTop: 16 }]}>Referral History</Text>
              {history.map((h) => {
                const checkedIn = !!h.last_checkin;
                return (
                  <View key={h.user_id} style={styles.histRow} testID={`refhist-${h.user_id}`}>
                    <View style={styles.histAvatar}>
                      <Text style={styles.histInitial}>{(h.name || "?").charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.histName} numberOfLines={1}>{h.name}</Text>
                      <Text style={styles.histSub} numberOfLines={1}>
                        Streak {h.streak} day{h.streak === 1 ? "" : "s"}
                        {checkedIn ? ` • Last check-in ${new Date(h.last_checkin!).toLocaleDateString()}` : " • Not checked in yet"}
                      </Text>
                    </View>
                    <View style={[styles.histBadge, h.rewards_paid.length > 0 ? styles.histBadgePaid : null]}>
                      <Text style={[styles.histBadgeText, h.rewards_paid.length > 0 ? { color: theme.colors.success } : null]}>
                        {h.rewards_paid.length > 0 ? `Paid ×${h.rewards_paid.length}` : "Pending"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.lg, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text, marginBottom: theme.spacing.md },
  hero: {
    padding: theme.spacing.lg,
    alignItems: "center",
    overflow: "hidden",
  },
  heroWrap: {
    borderRadius: theme.radii.xl,
    overflow: "hidden",
    marginBottom: theme.spacing.lg,
    ...(Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOpacity: 0.15, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14 }
      : { elevation: 5 }),
  },
  heroWatermark: {
    position: "absolute",
    right: -40, top: -50,
    transform: [{ rotate: "-12deg" }],
  },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroBody: { color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: "800", color: theme.colors.muted, letterSpacing: 1.4, marginBottom: 8 },
  codeBox: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  code: { fontSize: 22, fontWeight: "800", color: theme.colors.text, letterSpacing: 2 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  copyText: { color: theme.colors.primary, fontWeight: "700", fontSize: 13 },
  shareBtnWrap: {
    borderRadius: theme.radii.lg,
    overflow: "hidden",
    marginBottom: theme.spacing.lg,
    ...(Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10 }
      : { elevation: 3 }),
  },
  shareBtn: {
    height: 56,
    alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 10,
  },
  shareText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  applyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  applyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  applyTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  applySub: { fontSize: 12, color: theme.colors.muted, lineHeight: 18, marginBottom: 12 },
  applyRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1, backgroundColor: theme.colors.bg, borderRadius: theme.radii.md,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14,
    color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border,
    letterSpacing: 1,
  },
  applyBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 20,
    alignItems: "center", justifyContent: "center",
    borderRadius: theme.radii.md,
  },
  applyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  applyCardLocked: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  lockedText: { fontSize: 12, color: theme.colors.muted, lineHeight: 18 },

  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    borderWidth: 1, borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  statIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  statTitle: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  statSub: { fontSize: 12, color: theme.colors.muted },
  statValue: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
  howTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, marginBottom: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center",
  },
  stepNumText: { color: theme.colors.primary, fontWeight: "800", fontSize: 14 },
  stepText: { fontSize: 14, color: theme.colors.text, fontWeight: "500", flex: 1 },
  histRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  histAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center",
  },
  histInitial: { color: theme.colors.primary, fontWeight: "800", fontSize: 14 },
  histName: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  histSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  histBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border },
  histBadgePaid: { backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.25)" },
  histBadgeText: { fontSize: 11, fontWeight: "800", color: theme.colors.muted, letterSpacing: 0.4 },
});
